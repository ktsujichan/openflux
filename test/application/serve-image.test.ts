// Tests the serveImage workflow with in-memory implementations of the origin, transform and cache
import { err, ok } from "neverthrow";
import { describe, expect, it } from "vitest";

import { type ServeImageDeps, type ServeImageRequest, serveImage } from "../../src/application/serve-image";
import { Signature } from "../../src/domain/access/signature";
import { OriginConfig } from "../../src/domain/config/origin-config";
import type { CacheKey } from "../../src/domain/delivery/cache-key";
import type { ImageRenderer, RenderRequest } from "../../src/domain/image/image-renderer";
import type { SourceObject } from "../../src/domain/source/source-object";
import type { SourceResolver } from "../../src/domain/source/source-resolver";
import { solidPng } from "../../src/infrastructure/solid-png";

const png: SourceObject = {
  bytes: solidPng(0, 0, 0, 255),
  metadata: { contentType: "image/png", etag: '"origin-etag"', cacheControl: "max-age=60" },
};

const sources = (objects: Readonly<Record<string, SourceObject>>): SourceResolver => ({
  resolve: async (path) => {
    const found = objects[path];
    return found
      ? ok(found)
      : err({ kind: "OriginRejected", status: 404, body: "Not Found", contentType: "text/plain" });
  },
});

/** A transform that records the RenderRequest it receives and returns the format name as the body. */
const recordingRenderer = () => {
  const requests: RenderRequest[] = [];
  const renderer: ImageRenderer = {
    render: async (req) => {
      requests.push(req);
      return ok({ body: new TextEncoder().encode(req.format), contentType: `image/${req.format}` });
    },
  };
  return { renderer, requests };
};

const memoryCache = () => {
  const entries = new Map<CacheKey, Response>();
  return {
    entries,
    cachedResponses: { find: async (key: CacheKey) => entries.get(key)?.clone() },
    cacheStore: { save: (key: CacheKey, res: Response) => void entries.set(key, res) },
  };
};

const setup = (originOverrides: Readonly<Record<string, unknown>> = {}, signingSecret?: string) => {
  const origin = OriginConfig.schema.parse({
    hosts: ["img.example.com"],
    source: { kind: "http", host: "www.example.com" },
    ...originOverrides,
  });
  const { renderer, requests } = recordingRenderer();
  const cache = memoryCache();
  const deps: ServeImageDeps = {
    origin,
    signingSecret,
    sources: sources({ "/a.png": png, "/images/a.png": png }),
    renderer,
    cachedResponses: cache.cachedResponses,
    cacheStore: cache.cacheStore,
  };
  return { serve: serveImage(deps), requests, cache };
};

const request = (path: string, overrides: Partial<ServeImageRequest> = {}): ServeImageRequest => ({
  url: new URL(`https://img.example.com${path}`),
  method: "GET",
  accept: null,
  ifNoneMatch: null,
  clientIp: "192.0.2.1",
  signatureHeader: null,
  hasAuthorization: false,
  now: new Date("2026-10-09T00:00:00Z"),
  ...overrides,
});

describe("serveImage", () => {
  it("returns the source image as is when there are no parameters", async () => {
    const { serve, requests } = setup();
    const res = (await serve(request("/a.png")))._unsafeUnwrap();
    expect(res.headers.get("ETag")).toBe('"origin-etag"');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(png.bytes);
    expect(requests).toHaveLength(0);
  });

  it("transforms, carries over Cache-Control and adds a weak ETag", async () => {
    const { serve, requests } = setup();
    const res = (await serve(request("/w=100,f=webp/a.png")))._unsafeUnwrap();
    expect(await res.text()).toBe("webp");
    expect(res.headers.get("Cache-Control")).toBe("max-age=60");
    expect(res.headers.get("ETag")).toMatch(/^W\/"/);
    expect(res.headers.get("Vary")).toBeNull();
    expect(requests[0]).toMatchObject({ input: "png", format: "webp", params: { transform: { w: 100 } } });
  });

  it("selects fallback formats by Accept and adds Vary: Accept", async () => {
    const { serve } = setup();
    const webp = (await serve(request("/f=webp:auto/a.png", { accept: "image/webp" })))._unsafeUnwrap();
    expect(await webp.text()).toBe("webp");
    expect(webp.headers.get("Vary")).toBe("Accept");
    const fallback = (await serve(request("/f=webp:auto/a.png", { accept: "*/*" })))._unsafeUnwrap();
    expect(await fallback.text()).toBe("png");
  });

  it("serves from cache the second time, and 304 when If-None-Match matches", async () => {
    const { serve, requests } = setup();
    const first = (await serve(request("/w=100/a.png")))._unsafeUnwrap();
    const etag = first.headers.get("ETag");
    const second = (await serve(request("/w=100/a.png", { ifNoneMatch: etag })))._unsafeUnwrap();
    expect(second.status).toBe(304);
    expect(requests).toHaveLength(1);
  });

  it("HEAD returns no body", async () => {
    const { serve } = setup();
    const res = (await serve(request("/w=100/a.png", { method: "HEAD" })))._unsafeUnwrap();
    expect(res.body).toBeNull();
  });

  it("returns origin errors as is", async () => {
    const { serve } = setup();
    expect((await serve(request("/w=100/missing.png")))._unsafeUnwrapErr()).toMatchObject({
      kind: "OriginRejected",
      status: 404,
    });
  });

  it("invalid parameters are ParamError", async () => {
    const { serve } = setup();
    expect((await serve(request("/w=abc/a.png")))._unsafeUnwrapErr()).toEqual({
      kind: "InvalidValue",
      key: "w",
      value: "abc",
    });
    expect((await serve(request("/f=mp4/a.png")))._unsafeUnwrapErr()).toEqual({
      kind: "UnsupportedFormat",
      value: "mp4",
    });
  });

  it("expired expires is Expired", async () => {
    const { serve } = setup();
    expect((await serve(request("/w=10,expires=2020-01-01T00:00:00Z/a.png")))._unsafeUnwrapErr()).toMatchObject({
      kind: "Expired",
    });
  });

  it("IP address deny list", async () => {
    const { serve } = setup({ ipAccess: { mode: "deny", list: ["192.0.2.0/24"] } });
    expect((await serve(request("/a.png")))._unsafeUnwrapErr()).toEqual({ kind: "IpForbidden" });
  });

  it("URL signature: sig parameter / header / wrong signature / no signature", async () => {
    const { serve } = setup({}, "testsigningsecret");
    const sig = await Signature.sign("testsigningsecret", "/c/w=100/a.png");
    expect((await serve(request(`/c/sig=${sig},w=100/a.png`))).isOk()).toBe(true);
    expect((await serve(request("/c/w=100/a.png", { signatureHeader: sig }))).isOk()).toBe(true);
    expect((await serve(request("/c/sig=1.wrong,w=100/a.png")))._unsafeUnwrapErr()).toEqual({
      kind: "SignatureInvalid",
    });
    expect((await serve(request("/c/w=100/a.png")))._unsafeUnwrapErr()).toEqual({ kind: "SignatureRequired" });
  });

  it("path parameters: applies configured parameters and rejects URL parameters when overriding is disallowed", async () => {
    const { serve, requests } = setup({
      pathParams: [{ basePrefix: "/small/", targetPrefix: "/images/", params: "w=50", lockParams: true }],
    });
    expect((await serve(request("/small/a.png"))).isOk()).toBe(true);
    expect(requests[0]?.params.transform.w).toBe(50);
    expect((await serve(request("/w=10/small/a.png")))._unsafeUnwrapErr()).toEqual({
      kind: "ParameterOverrideForbidden",
    });
  });

  it("rejects parameters that are not overridable", async () => {
    const { serve } = setup({ allowedParams: ["w"] });
    expect((await serve(request("/w=10/a.png"))).isOk()).toBe(true);
    expect((await serve(request("/w=10,h=10/a.png")))._unsafeUnwrapErr()).toEqual({
      kind: "ParameterNotAllowed",
      key: "h",
    });
  });

  it("unsupported features: 400 when strict, otherwise reported in X-OpenFlux-Ignored", async () => {
    const lenient = setup();
    const res = (await lenient.serve(request("/t=(text=a)/a.png")))._unsafeUnwrap();
    expect(res.headers.get("X-OpenFlux-Ignored")).toBe("t (no font configured)");
    const strict = setup({ strict: true });
    expect((await strict.serve(request("/t=(text=a)/a.png")))._unsafeUnwrapErr()).toEqual({
      kind: "UnsupportedFeature",
      feature: "t (no font configured)",
    });
  });
});
