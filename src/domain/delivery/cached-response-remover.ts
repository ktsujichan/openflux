import type { CacheKey } from "./cache-key";

/** Removes an entry from this data center's cache. true if it was removed. */
export type CachedResponseRemover = Readonly<{
  remove: (key: CacheKey) => Promise<boolean>;
}>;
