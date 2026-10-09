import { err, ok } from "neverthrow";
import { describe, expect, it } from "vitest";

import { deleteCache, lookupCache } from "../../src/application/cache-api";
import { AppConfig } from "../../src/domain/config/app-config";
import { CacheKey } from "../../src/domain/delivery/cache-key";
import type { CachePurger } from "../../src/domain/delivery/cache-purger";

const config = AppConfig.parse({
  origins: [{ hosts: ["img.example.com"], source: { kind: "http", host: "www.example.com" } }],
})._unsafeUnwrap();

const url = "https://img.example.com/w=10,f=webp:auto/a.jpg";

const setup = (cachedKeys: readonly CacheKey[]) => {
  const entries = new Set<CacheKey>(cachedKeys);
  const deps = {
    config,
    apiToken: "secret-token",
    cachedResponses: { find: async (k: CacheKey) => (entries.has(k) ? new Response("") : undefined) },
    remover: { remove: async (k: CacheKey) => entries.delete(k) },
  };
  return { deps, entries };
};

describe("cache.lookup", () => {
  it("returns cached keys, including per-format caches", async () => {
    const webp = CacheKey.of(url, "webp");
    const { deps } = setup([webp]);
    expect((await lookupCache(deps)({ token: "secret-token", url }))._unsafeUnwrap()).toEqual([webp]);
  });

  it("empty for hosts that are not served", async () => {
    const { deps } = setup([]);
    const result = await lookupCache(deps)({ token: "secret-token", url: "https://other.example.com/a.jpg" });
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it("wrong token / invalid request", async () => {
    const { deps } = setup([]);
    expect((await lookupCache(deps)({ token: "wrong", url }))._unsafeUnwrapErr()).toEqual({ kind: "InvalidAuth" });
    expect((await lookupCache(deps)({ token: "secret-token", url: "not a url" }))._unsafeUnwrapErr()).toMatchObject({
      kind: "ValidationError",
    });
  });
});

describe("cache.delete", () => {
  it("deletes this data center's cache and returns the deleted keys", async () => {
    const plain = CacheKey.of(url);
    const { deps, entries } = setup([plain]);
    const result = await deleteCache({ ...deps, purger: undefined })({ token: "secret-token", url });
    expect(result._unsafeUnwrap()).toEqual([plain]);
    expect(entries.size).toBe(0);
  });

  it("with the Purge API, purges all keys and reports failure as PurgeFailed", async () => {
    const purged: CacheKey[] = [];
    const purger: CachePurger = { purge: async (keys) => (purged.push(...keys), ok(undefined)) };
    const { deps } = setup([]);
    const result = await deleteCache({ ...deps, purger })({ token: "secret-token", url });
    expect(result._unsafeUnwrap()).toHaveLength(8);
    expect(purged).toEqual(CacheKey.variants(url));

    const failing: CachePurger = { purge: async () => err({ kind: "PurgeFailed", status: 403, detail: "forbidden" }) };
    expect(
      (await deleteCache({ ...deps, purger: failing })({ token: "secret-token", url }))._unsafeUnwrapErr(),
    ).toEqual({
      kind: "PurgeFailed",
      status: 403,
      detail: "forbidden",
    });
  });
});
