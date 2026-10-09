export const WeakEtag = {
  /** Builds a weak ETag for the transform result from the origin's ETag etc., the URL and the output format. */
  compute: async (base: string, url: string, format: string): Promise<string> => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${base}\n${url}\n${format}`));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(digest).subarray(0, 18)));
    return `W/"${b64.replace(/\+/g, "-").replace(/\//g, "_")}"`;
  },

  /** Whether If-None-Match matches etag. */
  matches: (ifNoneMatch: string | null, etag: string | null): boolean =>
    etag !== null && ifNoneMatch !== null && ifNoneMatch.split(",").some((t) => t.trim() === etag || t.trim() === "*"),
} as const;
