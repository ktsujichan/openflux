import type { HttpSourceConfig } from "../domain/config/source-config";
import { ObjectPath } from "../domain/source/object-path";
import type { SourceResolver } from "../domain/source/source-resolver";
import { SourceResponse } from "./source-response";

/** HTTP(S) origin. When hostHeader is set, the Host header is set to it and the connection target is overridden to host. */
export const createHttpSourceResolver = (config: HttpSourceConfig): SourceResolver => ({
  resolve: async (path) => {
    const fullPath = ObjectPath.withPrefix(config.pathPrefix, path);
    const headers = { Accept: "image/*,*/*;q=0.8" };
    const res = config.hostHeader
      ? await fetch(`${config.scheme}://${config.hostHeader}${fullPath}`, {
          headers,
          cf: { resolveOverride: config.host },
        })
      : await fetch(`${config.scheme}://${config.host}${fullPath}`, { headers });
    return SourceResponse.toResult(res);
  },
});
