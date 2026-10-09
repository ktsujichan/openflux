import type { CacheKey } from "../domain/delivery/cache-key";
import type { CachedResponseRemover } from "../domain/delivery/cached-response-remover";
import type { CachedResponseResolver } from "../domain/delivery/cached-response-resolver";
import type { CachedResponseStore } from "../domain/delivery/cached-response-store";

/** The Workers Cache API (per data center cache). */
export const createEdgeCacheResolver = (cache: Cache): CachedResponseResolver => ({
  find: (key: CacheKey) => cache.match(key),
});

/** Stores in the background with waitUntil so as not to delay the response. */
export const createEdgeCacheStore = (cache: Cache, waitUntil: (p: Promise<unknown>) => void): CachedResponseStore => ({
  save: (key, response) => waitUntil(cache.put(key, response)),
});

export const createEdgeCacheRemover = (cache: Cache): CachedResponseRemover => ({
  remove: (key) => cache.delete(key),
});
