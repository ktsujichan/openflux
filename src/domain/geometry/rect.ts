import type { Size } from "./size";

export type Rect = Readonly<{ left: number; top: number; width: number; height: number }>;

export const Rect = {
  /** Intersects rect with (0, 0, size). undefined if they do not intersect. */
  clip: (rect: Rect, size: Size): Rect | undefined => {
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(size.width, rect.left + rect.width);
    const bottom = Math.min(size.height, rect.top + rect.height);
    if (right <= left || bottom <= top) return undefined;
    return { left, top, width: right - left, height: bottom - top };
  },

  /** Whether the region covers the whole image (no crop needed). */
  coversWhole: (rect: Rect, size: Size): boolean =>
    rect.left === 0 && rect.top === 0 && rect.width === size.width && rect.height === size.height,
} as const;
