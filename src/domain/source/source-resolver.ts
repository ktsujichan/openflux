import type { Result } from "neverthrow";

import type { ObjectPath } from "./object-path";
import type { OriginRejected } from "./origin-rejected";
import type { SourceObject } from "./source-object";

/**
 * Fetches a source image from the origin. Origin error responses become OriginRejected;
 * unexpected failures such as network errors propagate as Promise rejections up to the application boundary.
 */
export type SourceResolver = Readonly<{
  resolve: (path: ObjectPath) => Promise<Result<SourceObject, OriginRejected>>;
}>;
