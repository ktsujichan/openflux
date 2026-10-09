import type { FontSpec } from "./font-spec";
import type { MaskSpec } from "./mask-spec";
import type { Position } from "./position";
import type { Rgba } from "./rgba";
import type { Transform } from "./transform";

export type ImageOverlay = Readonly<{
  kind: "Image";
  /** Path on the origin (decoded). */
  path: string;
  transform: Transform;
  position: Position;
  mask?: MaskSpec;
}>;

export type TextOverlay = Readonly<{
  kind: "Text";
  text: string;
  fonts: readonly FontSpec[];
  size?: number;
  color: Rgba;
  background: Rgba;
  w?: number;
  h?: number;
  linespacing: number;
  align: 0 | 1 | 2;
  dir: 0 | 1 | 2;
  wrap: 0 | 1 | 2;
  ellipsize: boolean;
  justify: boolean;
  strike: boolean;
  /** Only clipping (oc/ocr/og) and rotation/flip (or) can be applied to the drawing area. */
  transform: Transform;
  position: Position;
  mask?: MaskSpec;
}>;

export type Overlay = ImageOverlay | TextOverlay;
