import { err, ok } from "neverthrow";

import type { CachePurger } from "../domain/delivery/cache-purger";

/** Cloudflare Purge API (by URL). */
export const createCloudflarePurger = (zoneId: string, apiToken: string): CachePurger => ({
  purge: async (keys) => {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ files: keys }),
    });
    return res.ok ? ok(undefined) : err({ kind: "PurgeFailed", status: res.status, detail: await res.text() });
  },
});
