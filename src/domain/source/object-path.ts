import * as z from "zod";

import { schemaResult } from "../shared/schema-result";

const ObjectPathBrand = Symbol();
const ObjectPathSchema = z.string().startsWith("/").brand<typeof ObjectPathBrand>();

/** Path of the object to request from the origin. Starts with `/` and is still percent-encoded. */
export type ObjectPath = z.infer<typeof ObjectPathSchema>;

export const ObjectPath = {
  schema: ObjectPathSchema,
  parse: schemaResult(ObjectPathSchema),

  /** Creates from the path part of a URL. A leading `/` is added if missing, so this never fails. */
  fromUrlPath: (path: string): ObjectPath => ObjectPathSchema.parse(path.startsWith("/") ? path : `/${path}`),

  /** Creates from a decoded path (as given in an overlay l=(…)) by encoding each segment. */
  fromDecoded: (path: string): ObjectPath =>
    ObjectPath.fromUrlPath(
      path
        .split("/")
        .map((s) => encodeURIComponent(s))
        .join("/"),
    ),

  /** Adds a prefix such as the Path Prefix. */
  withPrefix: (prefix: string, path: ObjectPath): ObjectPath =>
    ObjectPath.fromUrlPath(prefix.replace(/\/+$/, "") + path),
} as const;
