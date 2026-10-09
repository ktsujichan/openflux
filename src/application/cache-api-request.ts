import * as z from "zod";

import { schemaResult } from "../domain/shared/schema-result";

const CacheApiRequestSchema = z.object({
  token: z.string().min(1),
  url: z.url(),
});

/** A cache.lookup / cache.delete request (form / JSON / query string flattened). */
export type CacheApiRequest = Readonly<z.output<typeof CacheApiRequestSchema>>;

export const CacheApiRequest = {
  schema: CacheApiRequestSchema,
  parse: schemaResult(CacheApiRequestSchema),
} as const;
