import type { SourceMetadata } from "../source/source-object";

export type CacheHeaders = Readonly<{ cacheControl?: string; expires?: string }>;

export type CachePolicyInput = Readonly<{
  source: SourceMetadata;
  /** s-maxage added when the origin returns no Cache-Control/Expires (not added if 0). */
  defaultCacheSeconds: number;
  hasAuthorization: boolean;
  /** The expires parameter. */
  expiresAt?: Date;
  now: Date;
}>;

const maxAge = (cc: string | undefined, expires: string | undefined, now: Date): number | undefined => {
  const m = cc && (/s-maxage=(\d+)/.exec(cc) ?? /max-age=(\d+)/.exec(cc));
  if (m) return Number(m[1]);
  const t = expires === undefined ? Number.NaN : Date.parse(expires);
  return Number.isNaN(t) ? undefined : Math.max(0, Math.floor((t - now.getTime()) / 1000));
};

export const CachePolicy = {
  /**
   * Inherits the origin's Cache-Control/Expires. If neither is present, adds the default cache (s-maxage, must-revalidate);
   * if the expires parameter is present, max-age and Expires are capped at that deadline.
   */
  derive: ({ source, defaultCacheSeconds, hasAuthorization, expiresAt, now }: CachePolicyInput): CacheHeaders => {
    const useDefault = !source.cacheControl && !source.expires && defaultCacheSeconds > 0 && !hasAuthorization;
    const cacheControl = useDefault ? `s-maxage=${defaultCacheSeconds}, must-revalidate` : source.cacheControl;
    if (!expiresAt) return { cacheControl, expires: source.expires };
    const remaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
    const ttl = Math.min(remaining, maxAge(cacheControl, source.expires, now) ?? remaining);
    return {
      cacheControl: cacheControl ? `${cacheControl}, max-age=${ttl}` : `max-age=${ttl}`,
      expires: new Date(now.getTime() + ttl * 1000).toUTCString(),
    };
  },

  isCacheable: ({ cacheControl = "", expires }: CacheHeaders): boolean =>
    !/no-store|private/.test(cacheControl) &&
    (/(s-maxage|max-age)=\d*[1-9]/.test(cacheControl) || expires !== undefined),
} as const;
