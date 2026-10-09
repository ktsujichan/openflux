/**
 * ImageRenderer implementation using the Cloudflare Images binding.
 * Processes in order: main transform → overlays (including clipping masks) → encode (JPEG XL via WASM).
 */
import { Result, err, ok, safeTry } from "neverthrow";

import { OverlayPlacement } from "../domain/geometry/overlay-placement";
import { Size } from "../domain/geometry/size";
import type { EncodedImage, ImageRenderer, RenderRequest } from "../domain/image/image-renderer";
import { InputFormat } from "../domain/image/input-format";
import { MaskCompositing } from "../domain/image/mask-compositing";
import type { RenderError } from "../domain/image/render-error";
import type { ImageFormat } from "../domain/params/output-format";
import { OutputFormat } from "../domain/params/output-format";
import type { ImageOverlay, Overlay } from "../domain/params/overlay";
import { Rgba } from "../domain/params/rgba";
import { ObjectPath } from "../domain/source/object-path";
import type { SourceResolver } from "../domain/source/source-resolver";
import { Codecs } from "./codecs";
import { ImagesStage, type Stage } from "./images-stage";
import { renderTextOverlay } from "./text-overlay-renderer";

/** When used as a mask, also records whether the source image had an alpha channel. */
type OverlayStage = Stage & Readonly<{ hasAlpha: boolean }>;

const CLOUDFLARE_FORMATS = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
} as const satisfies Record<Exclude<ImageFormat, "jxl">, ImageOutputOptions["format"]>;

type Deps = Readonly<{ images: ImagesBinding; sources: SourceResolver }>;

const prepareImageOverlay = (deps: Deps, o: ImageOverlay) =>
  safeTry(async function* () {
    const source = yield* await deps.sources.resolve(ObjectPath.fromDecoded(o.path));
    const format = InputFormat.sniff(source.bytes);
    if (!InputFormat.isTransformable(format, true)) return err({ kind: "UnsupportedInput", format } as const);
    const bytes = await ImagesStage.normalizeInput(source.bytes, format);
    const stage = yield* await ImagesStage.transformImage(deps.images, bytes, o.transform);
    return ok<OverlayStage, RenderError>({ ...stage, hasAlpha: InputFormat.hasAlphaChannel(source.bytes, format) });
  });

/** Draws only text overlays whose fontUrl is set (already decided by SupportAssessment). */
const prepareOverlay = async (
  deps: Deps,
  o: Overlay,
  fontUrl: string | undefined,
): Promise<Result<OverlayStage | undefined, RenderError>> => {
  if (o.kind === "Image") return prepareImageOverlay(deps, o);
  if (fontUrl === undefined) return ok(undefined);
  return (await renderTextOverlay(deps.images, o, fontUrl)).map((stage) => ({ ...stage, hasAlpha: true }));
};

/**
 * Composites overlays in the given order. Those with mask clip the result composited so far.
 * Masks need the composited result so far as pixels, so overlays are processed sequentially.
 */
const drawOverlays = async (
  deps: Deps,
  base: Stage,
  overlays: readonly Overlay[],
  prepared: readonly (OverlayStage | undefined)[],
): Promise<Stage> => {
  const tr = await overlays.reduce(async (previous: Promise<ImageTransformer>, o, i) => {
    const current = await previous;
    const st = prepared[i];
    if (!st) return current;
    const pos = OverlayPlacement.origin(base.size, st.size, o.position);
    if (!o.mask) return ImagesStage.drawClipped(current, base.size, st, pos);
    const [px, maskPx] = await Promise.all([
      ImagesStage.pixelsOf({ tr: current, size: base.size }),
      ImagesStage.pixelsOf(st),
    ]);
    MaskCompositing.apply(px, maskPx, pos, o.mask, st.hasAlpha);
    return (await ImagesStage.fromPixels(deps.images, px)).tr;
  }, Promise.resolve(base.tr));
  return { tr, size: base.size };
};

const encode = async (stage: Stage, req: RenderRequest): Promise<Result<EncodedImage, RenderError>> => {
  const { format, params } = req;
  if (format === "jxl") {
    const pixels = Size.pixels(stage.size);
    if (pixels > req.jxl.maxPixels) return err({ kind: "JxlTooLarge", pixels, max: req.jxl.maxPixels });
    const px = await ImagesStage.pixelsOf(stage);
    const body = await Codecs.encodeJxl(px, { quality: params.q, effort: req.jxl.effort, lossless: params.lossless });
    return ok({ body, contentType: OutputFormat.mime.jxl });
  }
  const lossy = format === "jpeg" || format === "avif" || format === "webp";
  const result = await stage.tr.output({
    format: CLOUDFLARE_FORMATS[format],
    anim: params.anim,
    // WebP is lossless at quality=100
    ...(lossy ? { quality: format === "webp" && params.lossless ? 100 : params.q } : {}),
    // For formats without an alpha channel, composite onto the b color
    ...(format === "jpeg" ? { background: Rgba.css(Rgba.opaque(params.transform.b)) } : {}),
  });
  return ok({ body: result.image(), contentType: result.contentType() });
};

export const createCloudflareImageRenderer = (deps: Deps): ImageRenderer => ({
  render: async (req) =>
    safeTry(async function* () {
      const bytes = await ImagesStage.normalizeInput(req.bytes, req.input);
      const base = yield* await ImagesStage.transformImage(deps.images, bytes, req.params.transform);
      const prepared = await Promise.all(req.params.overlays.map((o, i) => prepareOverlay(deps, o, req.fonts[i])));
      const overlays = yield* Result.combine(prepared);
      const composed = await drawOverlays(deps, base, req.params.overlays, overlays);
      return encode(composed, req);
    }),
});
