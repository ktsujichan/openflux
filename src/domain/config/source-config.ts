import * as z from "zod";

const HttpSourceSchema = z.object({
  kind: z.literal("http"),
  scheme: z.enum(["http", "https"]).default("https"),
  host: z.string().min(1),
  pathPrefix: z.string().default("/"),
  /** Host header sent to the origin. When set, connects with name resolution overridden to host (only within the same zone). */
  hostHeader: z.string().min(1).optional(),
});

const S3SourceSchema = z.object({
  kind: z.literal("s3"),
  /** Defaults to Amazon S3 (`s3.<region>.amazonaws.com`). */
  endpoint: z.string().min(1).optional(),
  region: z.string().min(1),
  bucket: z.string().min(1),
  pathPrefix: z.string().default("/"),
  accessKeyIdEnv: z.string().min(1),
  secretAccessKeyEnv: z.string().min(1),
});

const R2SourceSchema = z.object({
  kind: z.literal("r2"),
  /** Binding name given to bindings.r2() in cloudflare.config.ts. */
  binding: z.string().min(1),
  pathPrefix: z.string().default("/"),
});

const SourceConfigSchema = z.discriminatedUnion("kind", [HttpSourceSchema, S3SourceSchema, R2SourceSchema]);

/** Where to fetch source images from. */
export type SourceConfig = Readonly<z.output<typeof SourceConfigSchema>>;
export type HttpSourceConfig = Readonly<z.output<typeof HttpSourceSchema>>;
export type S3SourceConfig = Readonly<z.output<typeof S3SourceSchema>>;
export type R2SourceConfig = Readonly<z.output<typeof R2SourceSchema>>;

export const SourceConfig = { schema: SourceConfigSchema } as const;
