/**
 * Image delivery workflow.
 *   access check → parameter parsing → cache lookup → origin fetch → transform → cache store
 * Decisions and calculations are pure domain functions; I/O (cache, origin, transform) goes through injected dependencies.
 */
import { type Result, err, ok, safeTry } from "neverthrow";

import type { AccessError } from "../domain/access/access-error";
import { Signature } from "../domain/access/signature";
import { IpAccess } from "../domain/config/ip-access";
import type { OriginConfig } from "../domain/config/origin-config";
import { PathParam } from "../domain/config/path-param";
import { type CacheHeaders, CachePolicy } from "../domain/delivery/cache-headers";
import { CacheKey } from "../domain/delivery/cache-key";
import type { CachedResponseResolver } from "../domain/delivery/cached-response-resolver";
import type { CachedResponseStore } from "../domain/delivery/cached-response-store";
import { WeakEtag } from "../domain/delivery/weak-etag";
import { FormatNegotiation } from "../domain/image/format-negotiation";
import type { ImageRenderer } from "../domain/image/image-renderer";
import { InputFormat } from "../domain/image/input-format";
import { SupportAssessment } from "../domain/image/support-assessment";
import type { UnsupportedInput } from "../domain/image/unsupported-input";
import type { OutputFormat } from "../domain/params/output-format";
import { ParamError } from "../domain/params/param-error";
import { Params } from "../domain/params/params";
import { ParseParams } from "../domain/params/parse-params";
import { RequestPath } from "../domain/params/request-path";
import type { ObjectPath } from "../domain/source/object-path";
import type { SourceObject } from "../domain/source/source-object";
import type { SourceResolver } from "../domain/source/source-resolver";
import type { ServeImageError } from "./serve-image-error";

export type ServeImageRequest = Readonly<{
  url: URL;
  method: "GET" | "HEAD";
  accept: string | null;
  ifNoneMatch: string | null;
  clientIp: string | null;
  /** X-OpenFlux-Signature header */
  signatureHeader: string | null;
  hasAuthorization: boolean;
  now: Date;
}>;

export type ServeImageDeps = Readonly<{
  origin: OriginConfig;
  /** Signing Secret for origins with URL signing enabled. undefined when signatures are not verified. */
  signingSecret: string | undefined;
  sources: SourceResolver;
  renderer: ImageRenderer;
  cachedResponses: CachedResponseResolver;
  cacheStore: CachedResponseStore;
}>;

/** The transform for this request: URL parameters combined with path parameters. */
type Resolved = Readonly<{ params: Params; objectPath: ObjectPath; transforms: boolean }>;

const accessError = (e: AccessError): Result<never, ServeImageError> => err(e);

const verifySignature = async (
  secret: string | undefined,
  path: RequestPath,
  req: ServeImageRequest,
): Promise<Result<void, AccessError>> => {
  if (secret === undefined) return ok(undefined);
  const signature = path.signature ?? req.signatureHeader;
  if (!signature) return err({ kind: "SignatureRequired" });
  const signingPath = path.signature !== undefined ? path.signingPath : req.url.pathname;
  return (await Signature.verify(secret, signingPath, signature)) ? ok(undefined) : err({ kind: "SignatureInvalid" });
};

/** Applies path parameters and layers URL parameters on top. Also enforces the no-override and overridable-parameter rules. */
const resolveParams = (origin: OriginConfig, path: RequestPath): Result<Resolved, ServeImageError> =>
  safeTry(function* () {
    const pathParam = PathParam.match(origin.pathParams, path.objectPath);
    const base = pathParam ? yield* ParseParams.parse(pathParam.params) : Params.default;
    const objectPath = pathParam ? PathParam.rewrite(pathParam, path.objectPath) : path.objectPath;
    if (path.rawParams === null) return ok({ params: base, objectPath, transforms: pathParam !== undefined });
    const params = yield* ParseParams.parse(path.rawParams, base);
    if (pathParam?.lockParams && params.keys.length) return accessError({ kind: "ParameterOverrideForbidden" });
    const denied = origin.allowedParams && params.keys.find((k) => !origin.allowedParams?.includes(k));
    if (denied) return accessError({ kind: "ParameterNotAllowed", key: denied });
    return ok({ params, objectPath, transforms: true });
  });

const cacheHeadersFor = (
  origin: OriginConfig,
  req: ServeImageRequest,
  source: SourceObject,
  params: Params,
): CacheHeaders =>
  CachePolicy.derive({
    source: source.metadata,
    defaultCacheSeconds: origin.defaultCacheSeconds,
    hasAuthorization: req.hasAuthorization,
    expiresAt: params.expires,
    now: req.now,
  });

const toHeaders = (entries: Readonly<Record<string, string | undefined>>): Headers =>
  new Headers(Object.entries(entries).flatMap(([k, v]) => (v === undefined ? [] : [[k, v]])));

/** Delivery without transformation (no parameters, or through is specified). */
const passThrough = (cache: CacheHeaders, source: SourceObject): Response =>
  new Response(source.bytes, {
    headers: toHeaders({
      "Content-Type": source.metadata.contentType,
      ETag: source.metadata.etag,
      "Last-Modified": source.metadata.lastModified,
      "Cache-Control": cache.cacheControl,
      Expires: cache.expires,
    }),
  });

const render = (
  deps: ServeImageDeps,
  req: ServeImageRequest,
  source: SourceObject,
  params: Params,
  choice: Exclude<OutputFormat, "mp4">,
  negotiated: boolean,
) =>
  safeTry(async function* () {
    const { origin } = deps;
    const cache = cacheHeadersFor(origin, req, source, params);
    const input = InputFormat.sniff(source.bytes);
    if (InputFormat.shouldPassThrough(input, params.through, origin.extendedInputs))
      return ok(passThrough(cache, source));
    if (!InputFormat.isTransformable(input, origin.extendedInputs)) {
      return err<never, UnsupportedInput>({ kind: "UnsupportedInput", format: input });
    }
    const support = yield* SupportAssessment.assess(params, origin, origin.strict);
    const format = FormatNegotiation.resolveAuto(choice, input);
    const encoded = yield* await deps.renderer.render({
      bytes: source.bytes,
      input,
      params,
      format,
      fonts: support.fonts,
      jxl: origin.jxl,
    });
    const etagBase = source.metadata.etag ?? source.metadata.lastModified ?? String(source.bytes.byteLength);
    const headers = toHeaders({
      "Content-Type": encoded.contentType,
      "Cache-Control": cache.cacheControl,
      Expires: cache.expires,
      "Last-Modified": source.metadata.lastModified,
      ETag: await WeakEtag.compute(etagBase, req.url.toString(), format),
      Vary: negotiated ? "Accept" : undefined,
      "X-OpenFlux-Ignored": support.ignored.length ? support.ignored.join(", ") : undefined,
    });
    return ok(new Response(encoded.body, { headers }));
  });

/** Handles 304 via If-None-Match and HEAD. */
const finalize = (req: ServeImageRequest, res: Response): Response => {
  if (WeakEtag.matches(req.ifNoneMatch, res.headers.get("ETag"))) {
    return new Response(null, { status: 304, headers: res.headers });
  }
  return req.method === "HEAD" ? new Response(null, { status: res.status, headers: res.headers }) : res;
};

export const serveImage = (deps: ServeImageDeps) => (req: ServeImageRequest) =>
  safeTry(async function* () {
    const { origin } = deps;
    if (!IpAccess.allows(origin.ipAccess, req.clientIp)) return accessError({ kind: "IpForbidden" });
    const path = yield* RequestPath.parse(req.url.pathname);
    yield* await verifySignature(deps.signingSecret, path, req);
    const { params, objectPath, transforms } = yield* resolveParams(origin, path);
    if (params.expires && params.expires.getTime() <= req.now.getTime()) {
      return accessError({ kind: "Expired", expiresAt: params.expires });
    }
    const { choice, negotiated } = FormatNegotiation.negotiate(params.f, req.accept);
    if (choice === "mp4") return ParamError.fail({ kind: "UnsupportedFormat", value: "mp4" });

    const key = CacheKey.of(req.url, negotiated ? choice : undefined);
    const cached = await deps.cachedResponses.find(key);
    if (cached) return ok(finalize(req, cached));

    const source = yield* await deps.sources.resolve(objectPath);
    const response = transforms
      ? yield* await render(deps, req, source, params, choice, negotiated)
      : passThrough(cacheHeadersFor(origin, req, source, params), source);
    const cacheControl = response.headers.get("Cache-Control") ?? undefined;
    const expires = response.headers.get("Expires") ?? undefined;
    if (CachePolicy.isCacheable({ cacheControl, expires })) deps.cacheStore.save(key, response.clone());
    return ok(finalize(req, response));
  });
