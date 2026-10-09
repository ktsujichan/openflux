import { err, ok } from "neverthrow";

import type { R2SourceConfig } from "../domain/config/source-config";
import { ObjectPath } from "../domain/source/object-path";
import type { SourceResolver } from "../domain/source/source-resolver";
import { SourceResponse } from "./source-response";

const decodeKey = (path: string): string | undefined => {
  try {
    return decodeURIComponent(path).replace(/^\/+/, "");
  } catch {
    return undefined;
  }
};

/** R2 bucket origin. */
export const createR2SourceResolver = (config: R2SourceConfig, bucket: R2Bucket): SourceResolver => ({
  resolve: async (path) => {
    const key = decodeKey(ObjectPath.withPrefix(config.pathPrefix, path));
    if (key === undefined) {
      return err({
        kind: "OriginRejected",
        status: 400,
        body: "invalid percent-encoding in path",
        contentType: "text/plain",
      });
    }
    const obj = await bucket.get(key);
    if (!obj) return err({ kind: "OriginRejected", status: 404, body: "Not Found", contentType: "text/plain" });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    headers.set("last-modified", obj.uploaded.toUTCString());
    return ok({ bytes: new Uint8Array(await obj.arrayBuffer()), metadata: SourceResponse.metadata(headers) });
  },
});
