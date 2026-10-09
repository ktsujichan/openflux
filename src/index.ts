/**
 * Worker entry point (composition root).
 * Validates env, assembles adapters according to the config, invokes the workflow and turns the result into an HTTP response.
 * Unexpected failures (exceptions, rejections) become 500 here.
 */
import { type Context, Hono } from "hono";
import type { Result } from "neverthrow";
import * as z from "zod";

import { deleteCache, lookupCache } from "./application/cache-api";
import { serveImage } from "./application/serve-image";
import { AppConfig } from "./domain/config/app-config";
import { ValidationError } from "./domain/shared/schema-result";
import { CacheApiHandler } from "./http/cache-api-handler";
import { ServeImageResponse } from "./http/serve-image-response";
import { textResponse } from "./http/text-response";
import { createCloudflareImageRenderer } from "./infrastructure/cloudflare-image-renderer";
import { createCloudflarePurger } from "./infrastructure/cloudflare-purger";
import { createEdgeCacheRemover, createEdgeCacheResolver, createEdgeCacheStore } from "./infrastructure/edge-cache";
import { Env, MisconfigurationError } from "./infrastructure/env";
import { sourceResolverFor } from "./infrastructure/source-resolvers";

type RawEnv = Readonly<Record<string, unknown>>;

// The same env object is passed within an isolate, so the validation result is reused
const parsedEnvs = new WeakMap<RawEnv, Result<Env, ValidationError>>();
const loadEnv = (raw: RawEnv): Result<Env, ValidationError> => {
  const cached = parsedEnvs.get(raw);
  if (cached) return cached;
  const parsed = Env.parse(raw);
  parsedEnvs.set(raw, parsed);
  return parsed;
};

type AppEnv = { Bindings: RawEnv; Variables: { env: Env } };

/** Dependencies shared by the cache API. undefined when `api` is not configured. */
const cacheApiDeps = (c: Context<AppEnv>) => {
  const config = c.var.env.OPENFLUX_CONFIG;
  const api = config.api;
  if (!api) return undefined;
  const cache = caches.default;
  return {
    api,
    cache,
    deps: { config, apiToken: Env.secret(c.env, api.tokenEnv), cachedResponses: createEdgeCacheResolver(cache) },
  };
};

/** Cache API (POST /api/cache.lookup, /api/cache.delete). Mounted only on API hosts. */
const cacheApi = new Hono<AppEnv>()
  .post("/cache.lookup", async (c) => {
    const ctx = cacheApiDeps(c);
    if (!ctx) return CacheApiHandler.unknownMethod();
    const params = await CacheApiHandler.readParams(c.req.raw);
    return CacheApiHandler.respond(await lookupCache(ctx.deps)(params));
  })
  .post("/cache.delete", async (c) => {
    const ctx = cacheApiDeps(c);
    if (!ctx) return CacheApiHandler.unknownMethod();
    const { api, cache, deps } = ctx;
    const purger = api.purge
      ? createCloudflarePurger(api.purge.zoneId, Env.secret(c.env, api.purge.apiTokenEnv))
      : undefined;
    const params = await CacheApiHandler.readParams(c.req.raw);
    return CacheApiHandler.respond(
      await deleteCache({ ...deps, remover: createEdgeCacheRemover(cache), purger })(params),
    );
  })
  .all("*", (c) =>
    CacheApiHandler.method(c.req.path) ? CacheApiHandler.methodNotAllowed() : CacheApiHandler.unknownMethod(),
  );

const handleImage = async (c: Context<AppEnv>): Promise<Response> => {
  const request = c.req.raw;
  if (request.method !== "GET" && request.method !== "HEAD") return textResponse(405, "method not allowed");
  const env = c.var.env;
  const raw = c.env;
  const url = new URL(request.url);
  const origin = AppConfig.findOrigin(env.OPENFLUX_CONFIG, url.hostname);
  if (!origin) return ServeImageResponse.error({ kind: "UnknownHost", host: url.hostname });
  const sources = sourceResolverFor(origin.source, raw);
  const cache = caches.default;
  const result = await serveImage({
    origin,
    signingSecret: origin.signedUrl ? Env.secret(raw, origin.signedUrl.secretEnv) : undefined,
    sources,
    renderer: createCloudflareImageRenderer({ images: env.IMAGES, sources }),
    cachedResponses: createEdgeCacheResolver(cache),
    cacheStore: createEdgeCacheStore(cache, (p) => c.executionCtx.waitUntil(p)),
  })({
    url,
    method: request.method,
    accept: request.headers.get("Accept"),
    ifNoneMatch: request.headers.get("If-None-Match"),
    clientIp: request.headers.get("CF-Connecting-IP"),
    signatureHeader: request.headers.get("X-OpenFlux-Signature"),
    hasAuthorization: request.headers.has("Authorization"),
    now: new Date(),
  });
  return result.match((response) => response, ServeImageResponse.error);
};

const ImagesErrorSchema = z.object({ code: z.number() });

/** Application boundary: turns failures not handled by the workflow into responses. */
const unexpected = (e: unknown): Response => {
  if (e instanceof MisconfigurationError) return textResponse(500, e.message);
  // Images binding error (9412: input is not an image)
  const images = ImagesErrorSchema.safeParse(e);
  if (images.success && images.data.code === 9412) {
    return textResponse(400, "input image format is not JPEG, PNG nor GIF");
  }
  console.error(e);
  return textResponse(500, `failed to convert image: ${e instanceof Error ? e.message : String(e)}`);
};

const app = new Hono<AppEnv>()
  .use(async (c, next) => {
    const env = loadEnv(c.env);
    if (env.isErr()) return textResponse(500, `invalid configuration: ${ValidationError.describe(env.error)}`);
    c.set("env", env.value);
    await next();
  })
  // /api/* on hosts other than the API host is treated as an image path
  .use("/api/*", async (c, next) =>
    AppConfig.isApiHost(c.var.env.OPENFLUX_CONFIG, new URL(c.req.url).hostname) ? next() : handleImage(c),
  )
  .route("/api", cacheApi)
  .all("*", handleImage)
  .onError(unexpected);

export default app satisfies ExportedHandler<RawEnv>;
