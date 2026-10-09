import * as z from "zod";

import { OutputFormat } from "../params/output-format";

const CacheKeyBrand = Symbol();
const CacheKeySchema = z.url().brand<typeof CacheKeyBrand>();

/**
 * Key (URL) under which a transform result is cached. URLs negotiated by Accept, such as f=webp:auto,
 * get a separate key per selected format with `__openflux_format` appended.
 */
export type CacheKey = z.infer<typeof CacheKeySchema>;

export const CacheKey = {
  schema: CacheKeySchema,

  of: (url: URL | string, format?: OutputFormat): CacheKey => {
    const key = new URL(url);
    if (format) key.searchParams.set("__openflux_format", format);
    return CacheKeySchema.parse(key.toString());
  },

  /** Lists every cache key a URL may map to (for the cache API). */
  variants: (url: URL | string): readonly CacheKey[] => [
    CacheKey.of(url),
    ...OutputFormat.all.map((f) => CacheKey.of(url, f)),
  ],
} as const;
