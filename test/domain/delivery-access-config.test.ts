import { describe, expect, it } from "vitest";

import { Signature } from "../../src/domain/access/signature";
import { AppConfig } from "../../src/domain/config/app-config";
import { IpAccess } from "../../src/domain/config/ip-access";
import { OriginConfig } from "../../src/domain/config/origin-config";
import { PathParam } from "../../src/domain/config/path-param";
import { CachePolicy } from "../../src/domain/delivery/cache-headers";
import { CacheKey } from "../../src/domain/delivery/cache-key";
import { ValidationError } from "../../src/domain/shared/schema-result";
import { ObjectPath } from "../../src/domain/source/object-path";

describe("Signature (documentation examples)", () => {
  it("example with a path", async () => {
    expect(await Signature.sign("testsigningsecret", "/c/w=200/images/1.jpg")).toBe(
      "1.tiKX5u2kw6wp9zDgl1tLiOIi8IsoRIBw8fVgVc0yrNg",
    );
  });
  it("example without parameters / padding is optional", async () => {
    const sig = "1.-Yd8m-5pXPihiZdlDATcwkkgjzPIC9gFHmmZ3JMxwS0";
    expect(await Signature.verify("testsigningsecret", "/images/1.jpg", `${sig}=`)).toBe(true);
    expect(await Signature.verify("testsigningsecret", "/images/1.jpg", sig)).toBe(true);
    expect(await Signature.verify("testsigningsecret", "/images/2.jpg", sig)).toBe(false);
  });
});

describe("IpAccess", () => {
  const acl = (mode: "allow" | "deny", list: readonly string[]) => IpAccess.schema.parse({ mode, list });

  it("CIDR matching", () => {
    expect(IpAccess.allows(acl("allow", ["192.168.0.0/24"]), "192.168.0.99")).toBe(true);
    expect(IpAccess.allows(acl("allow", ["192.168.0.0/24"]), "192.168.1.1")).toBe(false);
    expect(IpAccess.allows(acl("allow", ["10.0.0.1"]), "10.0.0.1")).toBe(true);
  });

  it("a CIDR with bits set outside the mask is a config error", () => {
    expect(IpAccess.schema.safeParse({ mode: "allow", list: ["192.168.0.1/24"] }).success).toBe(false);
    expect(IpAccess.schema.safeParse({ mode: "allow", list: ["999.0.0.0/8"] }).success).toBe(false);
  });

  it("allow list / deny list (IPv6 cannot be listed)", () => {
    expect(IpAccess.allows(acl("allow", ["10.0.0.0/8"]), "10.1.2.3")).toBe(true);
    expect(IpAccess.allows(acl("allow", ["10.0.0.0/8"]), "11.1.2.3")).toBe(false);
    expect(IpAccess.allows(acl("allow", ["10.0.0.0/8"]), "2001:db8::1")).toBe(false);
    expect(IpAccess.allows(acl("deny", ["10.0.0.0/8"]), "10.1.2.3")).toBe(false);
    expect(IpAccess.allows(acl("deny", ["10.0.0.0/8"]), "2001:db8::1")).toBe(true);
    expect(IpAccess.allows(undefined, null)).toBe(true);
  });
});

describe("AppConfig", () => {
  const origin = { hosts: ["img.example.com"], source: { kind: "http", host: "www.example.com" } };

  it("fills in defaults", () => {
    const config = AppConfig.parse({ origins: [origin] })._unsafeUnwrap();
    expect(config.origins[0]).toMatchObject({
      source: { kind: "http", scheme: "https", pathPrefix: "/" },
      defaultCacheSeconds: 0,
      pathParams: [],
      strict: false,
      extendedInputs: true,
      jxl: { effort: 3, maxPixels: 16_000_000 },
    });
  });

  it.each([
    ["origins is empty", { origins: [] }],
    ["unknown source", { origins: [{ ...origin, source: { kind: "ftp", host: "x" } }] }],
    ["defaultFont is not in fonts", { origins: [{ ...origin, defaultFont: "Noto" }] }],
    [
      "invalid params in a path parameter",
      { origins: [{ ...origin, pathParams: [{ basePrefix: "/s/", targetPrefix: "/", params: "w=abc" }] }] },
    ],
    ["jxl.effort is out of range", { origins: [{ ...origin, jxl: { effort: 10 } }] }],
  ])("invalid config: %s", (_, raw) => {
    const result = AppConfig.parse(raw);
    expect(result.isErr()).toBe(true);
    expect(ValidationError.describe(result._unsafeUnwrapErr())).not.toBe("");
  });

  it("selects the origin by host name, falling back to *", () => {
    const config = AppConfig.parse({
      origins: [origin, { hosts: ["*"], source: { kind: "http", host: "fallback.example.com" } }],
    })._unsafeUnwrap();
    expect(AppConfig.findOrigin(config, "IMG.example.com")?.source).toMatchObject({ host: "www.example.com" });
    expect(AppConfig.findOrigin(config, "other.example.com")?.source).toMatchObject({ host: "fallback.example.com" });
  });

  it("selects path parameters by longest Base Prefix match and replaces it with the Target Prefix", () => {
    const o = OriginConfig.schema.parse({
      ...origin,
      pathParams: [
        { basePrefix: "/s/", targetPrefix: "/", params: "w=100" },
        { basePrefix: "/s/large/", targetPrefix: "/images/", params: "w=800" },
      ],
    });
    const path = ObjectPath.fromUrlPath("/s/large/a.jpg");
    const matched = PathParam.match(o.pathParams, path);
    expect(matched?.params).toBe("w=800");
    expect(matched && PathParam.rewrite(matched, path)).toBe("/images/a.jpg");
  });
});

describe("CacheKey", () => {
  it("per-format keys", () => {
    expect(CacheKey.of("https://img.example.com/w=10,f=webp:auto/a.jpg")).toBe(
      "https://img.example.com/w=10,f=webp:auto/a.jpg",
    );
    expect(CacheKey.of("https://img.example.com/a.jpg", "webp")).toBe(
      "https://img.example.com/a.jpg?__openflux_format=webp",
    );
    expect(CacheKey.variants("https://img.example.com/a.jpg")).toHaveLength(8);
  });
});

describe("CachePolicy", () => {
  const now = new Date("2026-10-09T00:00:00Z");
  const base = { defaultCacheSeconds: 600, hasAuthorization: false, now };

  it("carries over the origin's Cache-Control", () => {
    expect(CachePolicy.derive({ ...base, source: { cacheControl: "max-age=60" } })).toEqual({
      cacheControl: "max-age=60",
      expires: undefined,
    });
  });

  it("default cache when the origin returns nothing (not added with Authorization)", () => {
    expect(CachePolicy.derive({ ...base, source: {} }).cacheControl).toBe("s-maxage=600, must-revalidate");
    expect(CachePolicy.derive({ ...base, source: {}, hasAuthorization: true }).cacheControl).toBeUndefined();
  });

  it("caps at the deadline from the expires parameter (same shape as demo.imageflux.jp)", () => {
    const h = CachePolicy.derive({ ...base, source: {}, expiresAt: new Date("2099-01-01T00:00:00Z") });
    expect(h.cacheControl).toBe("s-maxage=600, must-revalidate, max-age=600");
    expect(h.expires).toBe(new Date(now.getTime() + 600_000).toUTCString());
    const soon = CachePolicy.derive({ ...base, source: {}, expiresAt: new Date(now.getTime() + 30_000) });
    expect(soon.cacheControl).toBe("s-maxage=600, must-revalidate, max-age=30");
  });

  it("whether the response is cacheable", () => {
    expect(CachePolicy.isCacheable({ cacheControl: "s-maxage=600, must-revalidate" })).toBe(true);
    expect(CachePolicy.isCacheable({ cacheControl: "no-store" })).toBe(false);
    expect(CachePolicy.isCacheable({ cacheControl: "max-age=0" })).toBe(false);
    expect(CachePolicy.isCacheable({})).toBe(false);
  });
});
