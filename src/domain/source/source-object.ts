/** Headers from the origin response that are carried over on delivery. */
export type SourceMetadata = Readonly<{
  contentType?: string;
  cacheControl?: string;
  expires?: string;
  lastModified?: string;
  etag?: string;
}>;

/** Source image fetched from the origin. */
export type SourceObject = Readonly<{ bytes: Uint8Array; metadata: SourceMetadata }>;
