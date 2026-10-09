import * as z from "zod";

const ApiConfigSchema = z.object({
  /** Host name that accepts API requests. Must be in the same zone as image delivery (the Cache API and Purge are per zone). */
  hosts: z.array(z.string().min(1)).min(1),
  /** Name of the secret holding the API token (compared with the token request parameter). */
  tokenEnv: z.string().min(1),
  /**
   * If set, cache.delete also calls Cloudflare's Purge API (by URL) to clear the cache in all data centers.
   * Otherwise only the cache in the data center that received the API request is cleared.
   */
  purge: z.object({ zoneId: z.string().min(1), apiTokenEnv: z.string().min(1) }).optional(),
});

/** Settings for the cache API (cache.lookup / cache.delete) endpoint. */
export type ApiConfig = Readonly<z.output<typeof ApiConfigSchema>>;

export const ApiConfig = { schema: ApiConfigSchema } as const;
