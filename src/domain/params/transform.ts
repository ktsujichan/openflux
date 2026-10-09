import { type Crop } from "./crop";
import { Gravity } from "./gravity";
import type { Orientation } from "./orientation";
import { Rgba } from "./rgba";

export type AspectMode = 0 | 1 | 2 | 3;
export type Unsharp = Readonly<{ radius: number; sigma: number; gain: number; threshold: number }>;
export type Blur = Readonly<{ radius: number; sigma: number }>;

/** Transform parameters shared by the main image, overlay images and the text drawing area. */
export type Transform = Readonly<{
  w?: number;
  h?: number;
  a: AspectMode;
  b: Rgba;
  g: Gravity;
  u: boolean;
  dpr?: number;
  ic?: Crop;
  ig?: Gravity;
  oc?: Crop;
  og?: Gravity;
  ir?: Orientation;
  or?: Orientation;
  unsharp?: Unsharp;
  blur?: Blur;
  grayscale: number;
  sepia: number;
  brightness: number;
  contrast: number;
  invert: boolean;
}>;

export const Transform = {
  default: {
    a: 1,
    b: Rgba.white,
    g: Gravity.center,
    u: true,
    grayscale: 0,
    sepia: 0,
    brightness: 100,
    contrast: 100,
    invert: false,
  } as const satisfies Transform,

  inputGravity: (t: Transform): Gravity => t.ig ?? t.g,
  outputGravity: (t: Transform): Gravity => t.og ?? t.g,
} as const;
