import type { Result } from "neverthrow";

import type { CacheKey } from "./cache-key";

/** Purge API failure. Prompts the API caller to retry. */
export type PurgeFailed = Readonly<{ kind: "PurgeFailed"; status: number; detail: string }>;

/** Removes URLs from the cache in all data centers. */
export type CachePurger = Readonly<{
  purge: (keys: readonly CacheKey[]) => Promise<Result<void, PurgeFailed>>;
}>;
