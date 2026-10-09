/**
 * Building blocks for assembling the Cloudflare Images binding transform chain.
 *
 *   ir → ic → scale (w,h,a,g,u,dpr,b) → oc → or → filters
 *
 * Dimensions are computed first in the domain (CropArea / ResizePlan), and Cloudflare is given explicit sizes
 * (fit=squeeze / cover) and trim, so the output size and crop position match the domain's calculation.
 */
import { type Result, ok } from "neverthrow";

import { CropArea } from "../domain/geometry/crop-area";
import type { GeometryError } from "../domain/geometry/geometry-error";
import { Rect } from "../domain/geometry/rect";
import { ResizePlan } from "../domain/geometry/resize-plan";
import { Size } from "../domain/geometry/size";
import { Filters } from "../domain/image/filters";
import type { InputFormat } from "../domain/image/input-format";
import { JpegHeader } from "../domain/image/jpeg-header";
import type { Pixels } from "../domain/image/pixels";
import type { Crop } from "../domain/params/crop";
import { Gravity } from "../domain/params/gravity";
import { Orientation } from "../domain/params/orientation";
import type { Rgba } from "../domain/params/rgba";
import { Transform } from "../domain/params/transform";
import { assertNever } from "../domain/shared/assert-never";
import { Codecs } from "./codecs";
import { solidPng } from "./solid-png";

/** A transform chain and its (computed) resulting size. */
export type Stage = Readonly<{ tr: ImageTransformer; size: Size }>;

const stream = (b: Uint8Array): ReadableStream<Uint8Array> => new Blob([b]).stream();

const bytesOf = async (result: ImageTransformationResult): Promise<Uint8Array> =>
  new Uint8Array(await result.response().arrayBuffer());

/**
 * Size of the input image. Cloudflare Images applies Exif Orientation before transforming,
 * so for JPEGs with Orientation 5–8 width and height are swapped even if info() returns pre-rotation dimensions.
 * Only images already judged transformable are passed in, so missing dimensions are an invariant violation and throw.
 */
const sizeOf = async (images: ImagesBinding, bytes: Uint8Array): Promise<Size> => {
  const info = await images.info(stream(bytes));
  if (!("width" in info)) throw new Error(`Images binding returned no dimensions for ${info.format}`);
  const size = { width: info.width, height: info.height };
  const jpeg = JpegHeader.read(bytes);
  return jpeg && jpeg.orientation >= 5 && jpeg.width === size.width && jpeg.height === size.height
    ? Size.swap(size)
    : size;
};

const canvas = (images: ImagesBinding, size: Size, color: Rgba): ImageTransformer =>
  images
    .input(stream(solidPng(color.r, color.g, color.b, color.a)))
    .transform({ width: size.width, height: size.height, fit: "squeeze" });

const orient = (stage: Stage, o: Orientation | undefined): Stage => {
  // "auto" needs no extra handling because Cloudflare Images always applies Exif Orientation
  if (typeof o !== "number" || o === 1) return stage;
  return {
    tr: stage.tr.transform(Orientation.toFlipRotate(o)),
    size: Orientation.swapsAxes(o) ? Size.swap(stage.size) : stage.size,
  };
};

const crop = (stage: Stage, c: Crop | undefined, g: Gravity): Result<Stage, GeometryError> => {
  if (!c) return ok(stage);
  return CropArea.resolve(stage.size, c, g).map((r) =>
    Rect.coversWhole(r, stage.size)
      ? stage
      : { tr: stage.tr.transform({ trim: { ...r } }), size: { width: r.width, height: r.height } },
  );
};

const resize = (images: ImagesBinding, stage: Stage, t: Transform): Result<Stage, GeometryError> =>
  ResizePlan.plan(stage.size, t).map((plan): Stage => {
    const size = ResizePlan.outputSize(plan, stage.size);
    switch (plan.kind) {
      case "None":
        return stage;
      case "Scale":
        return { tr: stage.tr.transform({ width: plan.width, height: plan.height, fit: "squeeze" }), size };
      case "Cover": {
        const [x, y] = Gravity.factor(plan.gravity);
        const gravity = { x, y, mode: "remainder" } as const;
        return { tr: stage.tr.transform({ width: plan.width, height: plan.height, fit: "cover", gravity }), size };
      }
      case "Pad": {
        // Draw onto a canvas of the background color. Transparent areas are also composited with the background color.
        const inner = stage.tr.transform({ width: plan.inner.width, height: plan.inner.height, fit: "squeeze" });
        return { tr: canvas(images, plan.canvas, t.b).draw(inner, plan.offset), size };
      }
      default:
        return assertNever(plan);
    }
  });

const pixelsOf = async (stage: Stage): Promise<Pixels> =>
  Codecs.decodePng(await bytesOf(await stage.tr.output({ format: "image/png", anim: false })));

const fromPixels = async (images: ImagesBinding, px: Pixels): Promise<Stage> => ({
  tr: images.input(stream(await Codecs.encodePng(px))),
  size: { width: px.width, height: px.height },
});

/** Filters extract pixels, apply in software, and pass the result back to Cloudflare Images as PNG. */
const filter = async (images: ImagesBinding, stage: Stage, t: Transform): Promise<Stage> => {
  if (!Filters.hasFilters(t)) return stage;
  const px = await pixelsOf(stage);
  Filters.apply(px, t);
  return fromPixels(images, px);
};

/** Draws image at pos on target. Parts outside target (size) are clipped; nothing is drawn if entirely outside. */
const drawClipped = (
  target: ImageTransformer,
  size: Size,
  image: Stage,
  pos: Readonly<{ left: number; top: number }>,
): ImageTransformer => {
  const visible = Rect.clip({ ...pos, ...image.size }, size);
  if (!visible) return target;
  const tr = Size.equals(visible, image.size)
    ? image.tr
    : image.tr.transform({
        trim: {
          left: visible.left - pos.left,
          top: visible.top - pos.top,
          width: visible.width,
          height: visible.height,
        },
      });
  return target.draw(tr, { left: visible.left, top: visible.top });
};

export const ImagesStage = {
  stream,
  bytesOf,
  sizeOf,
  canvas,
  orient,
  crop,
  pixelsOf,
  fromPixels,
  drawClipped,

  /** Cloudflare Images cannot read JPEG XL, so convert to PNG before passing it in. */
  normalizeInput: async (bytes: Uint8Array, format: InputFormat): Promise<Uint8Array> =>
    format === "jxl" ? Codecs.encodePng(await Codecs.decodeJxl(bytes)) : bytes,

  /** Transform shared by the main image and overlay images. */
  transformImage: async (
    images: ImagesBinding,
    bytes: Uint8Array,
    t: Transform,
  ): Promise<Result<Stage, GeometryError>> => {
    const initial: Stage = { tr: images.input(stream(bytes)), size: await sizeOf(images, bytes) };
    const geometry = crop(orient(initial, t.ir), t.ic, Transform.inputGravity(t))
      .andThen((s) => resize(images, s, t))
      .andThen((s) => crop(s, t.oc, Transform.outputGravity(t)))
      .map((s) => orient(s, t.or));
    return geometry.asyncMap((s) => filter(images, s, t));
  },
} as const;
