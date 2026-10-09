import * as z from "zod";

import { IpAccess } from "./ip-access";
import { PathParam } from "./path-param";
import { SourceConfig } from "./source-config";

const OriginConfigSchema = z
  .object({
    /** Host name this origin accepts. `*` matches any host. */
    hosts: z.array(z.string().min(1)).min(1),
    description: z.string().optional(),
    source: SourceConfig.schema,
    /** URL signing. secretEnv is the name of the secret holding the Signing Secret. */
    signedUrl: z.object({ secretEnv: z.string().min(1) }).optional(),
    /** s-maxage (seconds) added when the origin returns no Cache-Control/Expires. */
    defaultCacheSeconds: z.number().int().min(0).max(2147483647).default(0),
    /** Transform parameters allowed in the URL (overridable parameters). */
    allowedParams: z.array(z.string()).optional(),
    ipAccess: IpAccess.schema.optional(),
    pathParams: z.array(PathParam.schema).default([]),
    /** Text overlay font name → URL of the font file (TTF/OTF/WOFF/WOFF2). */
    fonts: z
      .record(z.string(), z.url())
      .default({})
      .transform((r): ReadonlyMap<string, string> => new Map(Object.entries(r))),
    /** Font name (a key of fonts) used when font is omitted or not registered. */
    defaultFont: z.string().optional(),
    /** If true, return 400 when an unsupported feature is requested. If false, ignore it and report it in X-OpenFlux-Ignored. */
    strict: z.boolean().default(false),
    /** If true, HEIC / AVIF / JPEG XL inputs are also transformed. */
    extendedInputs: z.boolean().default(true),
    jxl: z
      .object({
        effort: z.number().int().min(1).max(9).default(3),
        maxPixels: z.number().int().positive().default(16_000_000),
      })
      .prefault({}),
  })
  .refine((o) => o.defaultFont === undefined || o.fonts.has(o.defaultFont), {
    message: "defaultFont must be one of the keys of fonts",
    path: ["defaultFont"],
  });

/** Origin settings per host name. */
export type OriginConfig = Readonly<z.output<typeof OriginConfigSchema>>;

export const OriginConfig = { schema: OriginConfigSchema } as const;
