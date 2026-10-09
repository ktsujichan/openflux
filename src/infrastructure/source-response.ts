import { type Result, err, ok } from "neverthrow";

import type { OriginRejected } from "../domain/source/origin-rejected";
import type { SourceMetadata, SourceObject } from "../domain/source/source-object";

const header = (headers: Headers, name: string): string | undefined => headers.get(name) ?? undefined;

export const SourceResponse = {
  metadata: (headers: Headers): SourceMetadata => ({
    contentType: header(headers, "content-type"),
    cacheControl: header(headers, "cache-control"),
    expires: header(headers, "expires"),
    lastModified: header(headers, "last-modified"),
    etag: header(headers, "etag"),
  }),

  /** Turns an HTTP response into a SourceObject on success, or OriginRejected on an error response. */
  toResult: async (res: Response): Promise<Result<SourceObject, OriginRejected>> => {
    if (!res.ok) {
      return err({
        kind: "OriginRejected",
        status: res.status,
        body: await res.text(),
        contentType: header(res.headers, "content-type"),
      });
    }
    return ok({ bytes: new Uint8Array(await res.arrayBuffer()), metadata: SourceResponse.metadata(res.headers) });
  },
} as const;
