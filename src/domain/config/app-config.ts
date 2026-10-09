import * as z from "zod";

import { schemaResult } from "../shared/schema-result";
import { ApiConfig } from "./api-config";
import { OriginConfig } from "./origin-config";

const AppConfigSchema = z.object({
  origins: z.array(OriginConfig.schema).min(1),
  api: ApiConfig.schema.optional(),
});

/** The whole OPENFLUX_CONFIG. */
export type AppConfig = Readonly<z.output<typeof AppConfigSchema>>;

const sameHost = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const AppConfig = {
  schema: AppConfigSchema,
  parse: schemaResult(AppConfigSchema),

  /** The origin whose host name matches, or the `*` origin if none does. */
  findOrigin: (config: AppConfig, hostname: string): OriginConfig | undefined =>
    config.origins.find((o) => o.hosts.some((h) => sameHost(h, hostname))) ??
    config.origins.find((o) => o.hosts.includes("*")),

  isApiHost: (config: AppConfig, hostname: string): boolean =>
    config.api?.hosts.some((h) => sameHost(h, hostname)) ?? false,
} as const;
