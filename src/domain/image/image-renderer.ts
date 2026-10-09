import type { Result } from "neverthrow";

import type { ImageFormat } from "../params/output-format";
import type { Params } from "../params/params";
import type { InputFormat } from "./input-format";
import type { JxlSettings } from "./jxl-settings";
import type { RenderError } from "./render-error";

export type RenderRequest = Readonly<{
  bytes: Uint8Array;
  input: InputFormat;
  params: Params;
  format: ImageFormat;
  /** Font URLs for text overlays, in the same order as the overlays (from SupportAssessment). */
  fonts: readonly (string | undefined)[];
  jxl: JxlSettings;
}>;

export type EncodedImage = Readonly<{ body: ReadableStream<Uint8Array> | Uint8Array; contentType: string }>;

/** Transforms and encodes an image according to the transform parameters. */
export type ImageRenderer = Readonly<{
  render: (request: RenderRequest) => Promise<Result<EncodedImage, RenderError>>;
}>;
