import type { PurgeFailed } from "../domain/delivery/cache-purger";
import type { ValidationError } from "../domain/shared/schema-result";

/** Failures that can occur in the cache API. */
export type CacheApiError = Readonly<{ kind: "InvalidAuth" }> | ValidationError | PurgeFailed;
