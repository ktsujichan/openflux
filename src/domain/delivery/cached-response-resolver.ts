import type { CacheKey } from "./cache-key";

/** Looks up a cached transform result. */
export type CachedResponseResolver = Readonly<{
  find: (key: CacheKey) => Promise<Response | undefined>;
}>;
