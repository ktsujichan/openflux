/** Boundary for the Workers env (bindings, variables, secrets). */
import * as z from "zod";

import { AppConfig } from "../domain/config/app-config";
import { schemaResult } from "../domain/shared/schema-result";

const hasFunctions = (v: unknown, names: readonly string[]): boolean =>
  typeof v === "object" && v !== null && names.every((n) => n in v && typeof Reflect.get(v, n) === "function");

/** Config passed as a string (wrangler vars or .dev.vars) is parsed as JSON. */
const parseJsonString = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

const EnvSchema = z.object({
  IMAGES: z.custom<ImagesBinding>((v) => hasFunctions(v, ["input", "info"]), { message: "Images binding is required" }),
  OPENFLUX_CONFIG: z.preprocess(parseJsonString, AppConfig.schema),
});

export type Env = Readonly<z.output<typeof EnvSchema>>;

const SecretSchema = z.string().min(1);
const R2BucketSchema = z.custom<R2Bucket>((v) => hasFunctions(v, ["get", "head"]));

/**
 * Deployment misconfiguration. It is unrecoverable, so it propagates as an exception to the application boundary (500).
 * It exceptionally extends Error so the boundary can tell it apart from other exceptions with instanceof.
 */
export class MisconfigurationError extends Error {}

export const Env = {
  schema: EnvSchema,
  parse: schemaResult(EnvSchema),

  secret: (raw: Readonly<Record<string, unknown>>, name: string): string => {
    const r = SecretSchema.safeParse(raw[name]);
    if (!r.success) throw new MisconfigurationError(`secret ${name} is not configured`);
    return r.data;
  },

  r2Bucket: (raw: Readonly<Record<string, unknown>>, name: string): R2Bucket => {
    const r = R2BucketSchema.safeParse(raw[name]);
    if (!r.success) throw new MisconfigurationError(`R2 binding ${name} is not configured`);
    return r.data;
  },
} as const;
