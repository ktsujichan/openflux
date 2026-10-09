/**
 * Clipping masks (l=(mask=...) / t=(mask=...)).
 * The overlay itself is not drawn; its image is used as a mask to cut the alpha of the image composited so far.
 * Spec:
 *   - alpha: output alpha = base alpha × mask alpha / 255 (RGB unchanged)
 *   - white: uses the mask's luminance as alpha (mask alpha is ignored). black is its inverse
 *   - Luminance is Rec.709 luminance in linear RGB converted back to sRGB (fractions truncated)
 *   - padding=0 makes the area outside the mask transparent; 1 leaves it as is
 *
 * Per-pixel computation is written as imperative loops for performance and mutates Pixels in place (see pixels.ts).
 */
import type { MaskSpec } from "../params/mask-spec";
import type { Pixels } from "./pixels";

/** sRGB 8bit → linear */
const TO_LINEAR = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

function luminance(r: number, g: number, b: number): number {
  const y = 0.2126 * (TO_LINEAR[r] ?? 0) + 0.7152 * (TO_LINEAR[g] ?? 0) + 0.0722 * (TO_LINEAR[b] ?? 0);
  const s = y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, Math.floor(s * 255 + 1e-6)));
}

/**
 * Clips base with mask (placed with its top-left at offset). Mutates base directly.
 * If alpha is specified for an image where maskHasAlpha is false, it is treated as white.
 */
function applyMask(
  base: Pixels,
  mask: Pixels,
  offset: { left: number; top: number },
  spec: MaskSpec,
  maskHasAlpha: boolean,
): void {
  const kind = spec.kind === "Alpha" && !maskHasAlpha ? "White" : spec.kind;
  const b = base.data;
  const m = mask.data;
  for (let y = 0; y < base.height; y++) {
    const my = y - offset.top;
    for (let x = 0; x < base.width; x++) {
      const i = (y * base.width + x) * 4 + 3;
      const mx = x - offset.left;
      if (mx < 0 || my < 0 || mx >= mask.width || my >= mask.height) {
        if (spec.padding === 0) b[i] = 0;
        continue;
      }
      const j = (my * mask.width + mx) * 4;
      let v: number;
      if (kind === "Alpha") v = m[j + 3] ?? 0;
      else {
        v = luminance(m[j] ?? 0, m[j + 1] ?? 0, m[j + 2] ?? 0);
        if (kind === "Black") v = 255 - v;
      }
      b[i] = Math.floor(((b[i] ?? 0) * v) / 255);
    }
  }
}

export const MaskCompositing = {
  luminance,
  apply: applyMask,
} as const;
