/**
 * Cache API (cache.lookup / cache.delete) workflow.
 */
import { type Result, err, ok, safeTry } from "neverthrow";

import { Signature } from "../domain/access/signature";
import { AppConfig } from "../domain/config/app-config";
import { CacheKey } from "../domain/delivery/cache-key";
import type { CachePurger } from "../domain/delivery/cache-purger";
import type { CachedResponseRemover } from "../domain/delivery/cached-response-remover";
import type { CachedResponseResolver } from "../domain/delivery/cached-response-resolver";
import type { CacheApiError } from "./cache-api-error";
import { CacheApiRequest } from "./cache-api-request";

export type CacheApiDeps = Readonly<{
  config: AppConfig;
  apiToken: string;
  cachedResponses: CachedResponseResolver;
}>;

export type CacheDeleteDeps = CacheApiDeps &
  Readonly<{
    remover: CachedResponseRemover;
    /** Only when using the Purge API. */
    purger: CachePurger | undefined;
  }>;

const authenticate = (deps: CacheApiDeps, raw: unknown): Result<CacheApiRequest, CacheApiError> =>
  CacheApiRequest.parse(raw).andThen((req): Result<CacheApiRequest, CacheApiError> =>
    Signature.timingSafeEqual(req.token, deps.apiToken) ? ok(req) : err({ kind: "InvalidAuth" }),
  );

/** Cache keys for a URL on a served host, including per-format keys. Empty if the host is not served. */
const keysFor = (config: AppConfig, url: string): readonly CacheKey[] =>
  AppConfig.findOrigin(config, new URL(url).hostname) ? CacheKey.variants(url) : [];

const cachedKeys = async (
  resolver: CachedResponseResolver,
  keys: readonly CacheKey[],
): Promise<readonly CacheKey[]> => {
  const hits = await Promise.all(keys.map(async (k) => ((await resolver.find(k)) ? [k] : [])));
  return hits.flat();
};

/** cache.lookup: returns the keys cached in this data center. */
export const lookupCache = (deps: CacheApiDeps) => (raw: unknown) =>
  safeTry(async function* () {
    const req = yield* authenticate(deps, raw);
    return ok(await cachedKeys(deps.cachedResponses, keysFor(deps.config, req.url)));
  });

/**
 * cache.delete: deletes the cache in this data center, and purges from all data centers if a purger is given.
 * When the Purge API is used we cannot tell which data centers held the entries, so all target keys are returned.
 */
export const deleteCache = (deps: CacheDeleteDeps) => (raw: unknown) =>
  safeTry(async function* () {
    const req = yield* authenticate(deps, raw);
    const keys = keysFor(deps.config, req.url);
    if (keys.length === 0) return ok<readonly CacheKey[], CacheApiError>([]);
    const cached = await cachedKeys(deps.cachedResponses, keys);
    await Promise.all(keys.map((k) => deps.remover.remove(k)));
    if (!deps.purger) return ok(cached);
    yield* await deps.purger.purge(keys);
    return ok(keys);
  });
