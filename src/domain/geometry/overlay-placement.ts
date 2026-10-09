import { Gravity } from "../params/gravity";
import type { Position } from "../params/position";
import { anchor } from "./anchor";
import type { Size } from "./size";

export const OverlayPlacement = {
  /** Top-left coordinate of the overlay. May extend outside the image (clipped when drawing). */
  origin: (base: Size, overlay: Size, pos: Position): Readonly<{ left: number; top: number }> => {
    const [fx, fy] = Gravity.factor(pos.lg);
    const x = pos.xr !== undefined ? Math.round(pos.xr * base.width) : pos.x;
    const y = pos.yr !== undefined ? Math.round(pos.yr * base.height) : pos.y;
    return { left: anchor(base.width, overlay.width, x, fx), top: anchor(base.height, overlay.height, y, fy) };
  },
} as const;
