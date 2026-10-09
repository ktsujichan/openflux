import type { SourceConfig } from "../domain/config/source-config";
import { assertNever } from "../domain/shared/assert-never";
import type { SourceResolver } from "../domain/source/source-resolver";
import { Env } from "./env";
import { createHttpSourceResolver } from "./http-source-resolver";
import { createR2SourceResolver } from "./r2-source-resolver";
import { createS3SourceResolver } from "./s3-source-resolver";

/** Creates the origin adapter for the configured source. */
export const sourceResolverFor = (source: SourceConfig, rawEnv: Readonly<Record<string, unknown>>): SourceResolver => {
  switch (source.kind) {
    case "http":
      return createHttpSourceResolver(source);
    case "s3":
      return createS3SourceResolver(source, {
        accessKeyId: Env.secret(rawEnv, source.accessKeyIdEnv),
        secretAccessKey: Env.secret(rawEnv, source.secretAccessKeyEnv),
      });
    case "r2":
      return createR2SourceResolver(source, Env.r2Bucket(rawEnv, source.binding));
    default:
      return assertNever(source);
  }
};
