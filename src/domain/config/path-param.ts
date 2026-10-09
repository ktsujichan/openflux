import * as z from "zod";

import { ParseParams } from "../params/parse-params";
import { ObjectPath } from "../source/object-path";

const PathParamSchema = z.object({
  basePrefix: z.string().startsWith("/"),
  targetPrefix: z.string().startsWith("/"),
  params: z.string().refine((p) => ParseParams.parse(p).isOk(), { message: "invalid conversion parameters" }),
  /** "Do not allow parameters to be overridden or changed via the URL" */
  lockParams: z.boolean().default(false),
});

/** Transform parameters preconfigured per path. */
export type PathParam = Readonly<z.output<typeof PathParamSchema>>;

export const PathParam = {
  schema: PathParamSchema,

  /** Selected by longest Base Prefix match. */
  match: (candidates: readonly PathParam[], path: ObjectPath): PathParam | undefined =>
    candidates
      .filter((p) => path.startsWith(p.basePrefix))
      .reduce<PathParam | undefined>(
        (best, p) => (!best || p.basePrefix.length > best.basePrefix.length ? p : best),
        undefined,
      ),

  /** Replaces the Base Prefix with the Target Prefix. */
  rewrite: (p: PathParam, path: ObjectPath): ObjectPath =>
    ObjectPath.fromUrlPath(
      `${p.targetPrefix.replace(/\/+$/, "")}/${path.slice(p.basePrefix.length).replace(/^\/+/, "")}`,
    ),
} as const;
