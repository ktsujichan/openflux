import { AwsClient } from "aws4fetch";

import type { S3SourceConfig } from "../domain/config/source-config";
import { ObjectPath } from "../domain/source/object-path";
import type { SourceResolver } from "../domain/source/source-resolver";
import { SourceResponse } from "./source-response";

export type S3Credentials = Readonly<{ accessKeyId: string; secretAccessKey: string }>;

/** S3 API compatible origin (Amazon S3 / Sakura Object Storage / Google Cloud Storage). */
export const createS3SourceResolver = (config: S3SourceConfig, credentials: S3Credentials): SourceResolver => {
  const client = new AwsClient({ ...credentials, service: "s3", region: config.region });
  const endpoint = config.endpoint ?? `s3.${config.region}.amazonaws.com`;
  return {
    resolve: async (path) =>
      SourceResponse.toResult(
        await client.fetch(`https://${endpoint}/${config.bucket}${ObjectPath.withPrefix(config.pathPrefix, path)}`),
      ),
  };
};
