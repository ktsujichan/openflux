import type { Result } from "neverthrow";

import type { GeometryError } from "../domain/geometry/geometry-error";
import { TextLayout } from "../domain/image/text-layout";
import type { TextOverlay } from "../domain/params/overlay";
import { Rgba } from "../domain/params/rgba";
import { Transform } from "../domain/params/transform";
import { ImagesStage, type Stage } from "./images-stage";

type RenderedLine = Readonly<{ png: Uint8Array; size: Readonly<{ width: number; height: number }> }>;

/** Draws one line with Cloudflare Images' text() and returns it as PNG. Empty lines are not drawn. */
const renderLine = async (
  images: ImagesBinding,
  line: string,
  options: TextOptions,
): Promise<RenderedLine | undefined> => {
  if (line === "") return undefined;
  const png = await ImagesStage.bytesOf(await images.text(line, options).output({ format: "image/png" }));
  return { png, size: await ImagesStage.sizeOf(images, png) };
};

/**
 * Builds the drawing area for a text overlay. Draws one line per newline, and places them on a background-color
 * canvas with line height, alignment and strikethrough following TextLayout.
 */
export const renderTextOverlay = async (
  images: ImagesBinding,
  o: TextOverlay,
  fontUrl: string,
): Promise<Result<Stage, GeometryError>> => {
  const options: TextOptions = {
    font: { url: fontUrl },
    color: Rgba.css(o.color),
    ...(o.size === undefined ? {} : { size: o.size }),
  };
  const lines = await Promise.all(o.text.split(/\r?\n/).map((line) => renderLine(images, line, options)));
  const emptyHeight = lines.find((l) => l !== undefined)?.size.height ?? 1;
  const layout = TextLayout.layout(
    lines.map((l) => l?.size ?? { width: 0, height: emptyHeight }),
    { w: o.w, h: o.h, align: o.align, linespacing: o.linespacing, strike: o.strike },
  );

  const withLines = lines.reduce(
    (tr, l, i) =>
      l && layout.lines[i]
        ? ImagesStage.drawClipped(
            tr,
            layout.area,
            { tr: images.input(ImagesStage.stream(l.png)), size: l.size },
            layout.lines[i],
          )
        : tr,
    ImagesStage.canvas(images, layout.area, o.background),
  );
  const withStrikes = layout.strikes.reduce(
    (tr, s) => ImagesStage.drawClipped(tr, layout.area, { tr: ImagesStage.canvas(images, s, o.color), size: s }, s),
    withLines,
  );
  return ImagesStage.crop(
    { tr: withStrikes, size: layout.area },
    o.transform.oc,
    Transform.outputGravity(o.transform),
  ).map((stage) => ImagesStage.orient(stage, o.transform.or));
};
