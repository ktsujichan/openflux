import type { CacheKey } from "./cache-key";

/** Stores a transform result in the cache. Implementations store in the background so as not to delay the response. */
export type CachedResponseStore = Readonly<{
  save: (key: CacheKey, response: Response) => void;
}>;
