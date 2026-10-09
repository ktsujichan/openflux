/**
 * Applies filters in software to RGBA pixels.
 * Cloudflare Images' saturation/brightness/contrast use different formulas from the ones we need,
 * and sepia/invert do not exist, so all filters are processed here.
 *
 * Color filters use the same matrices as CSS Filter Effects, truncating fractions at each step.
 *
 * Per-pixel computation is written as imperative loops for performance and mutates Pixels in place (see pixels.ts).
 */
import type { Blur, Transform, Unsharp } from "../params/transform";
import type { Pixels } from "./pixels";

export type FilterParams = Pick<
  Transform,
  "unsharp" | "blur" | "grayscale" | "sepia" | "brightness" | "contrast" | "invert"
>;

const hasFilters = (t: FilterParams): boolean =>
  t.unsharp !== undefined ||
  t.blur !== undefined ||
  t.grayscale > 0 ||
  t.sepia > 0 ||
  t.brightness !== 100 ||
  t.contrast !== 100 ||
  t.invert;

/** Order: unsharp/blur → grayscale → sepia → brightness → contrast → invert */
const applyFilters = (px: Pixels, t: FilterParams): void => {
  if (t.unsharp) unsharpMask(px, t.unsharp);
  else if (t.blur) gaussianBlur(px, t.blur);
  const matrices: number[][] = [];
  if (t.grayscale > 0) matrices.push(grayscaleMatrix(t.grayscale / 100));
  if (t.sepia > 0) matrices.push(sepiaMatrix(t.sepia / 100));
  const brightness = t.brightness / 100;
  const contrast = t.contrast / 100;
  if (matrices.length === 0 && brightness === 1 && contrast === 1 && !t.invert) return;

  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] ?? 0;
    let g = d[i + 1] ?? 0;
    let b = d[i + 2] ?? 0;
    for (const m of matrices) {
      const nr = clamp8((m[0] ?? 0) * r + (m[1] ?? 0) * g + (m[2] ?? 0) * b);
      const ng = clamp8((m[3] ?? 0) * r + (m[4] ?? 0) * g + (m[5] ?? 0) * b);
      const nb = clamp8((m[6] ?? 0) * r + (m[7] ?? 0) * g + (m[8] ?? 0) * b);
      r = nr;
      g = ng;
      b = nb;
    }
    if (brightness !== 1) {
      r = clamp8(r * brightness);
      g = clamp8(g * brightness);
      b = clamp8(b * brightness);
    }
    if (contrast !== 1) {
      const intercept = 127.5 * (1 - contrast);
      r = clamp8(r * contrast + intercept);
      g = clamp8(g * contrast + intercept);
      b = clamp8(b * contrast + intercept);
    }
    if (t.invert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
};

const clamp8 = (v: number) => (v <= 0 ? 0 : v >= 255 ? 255 : Math.floor(v));

/** https://www.w3.org/TR/filter-effects-1/#grayscaleEquivalent */
function grayscaleMatrix(a: number): number[] {
  const s = 1 - a;
  return [
    0.2126 + 0.7874 * s,
    0.7152 - 0.7152 * s,
    0.0722 - 0.0722 * s,
    0.2126 - 0.2126 * s,
    0.7152 + 0.2848 * s,
    0.0722 - 0.0722 * s,
    0.2126 - 0.2126 * s,
    0.7152 - 0.7152 * s,
    0.0722 + 0.9278 * s,
  ];
}

/** https://www.w3.org/TR/filter-effects-1/#sepiaEquivalent */
function sepiaMatrix(a: number): number[] {
  const s = 1 - a;
  return [
    0.393 + 0.607 * s,
    0.769 - 0.769 * s,
    0.189 - 0.189 * s,
    0.349 - 0.349 * s,
    0.686 + 0.314 * s,
    0.168 - 0.168 * s,
    0.272 - 0.272 * s,
    0.534 - 0.534 * s,
    0.131 + 0.869 * s,
  ];
}

function gaussianKernel(radius: number, sigma: number): Float32Array {
  const k = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + radius] = v;
    sum += v;
  }
  return k.map((v) => v / sum);
}

/** Separable Gaussian blur. Edges are handled by extending edge pixels. Returns the result as a Float32Array. */
function blurred({ data, width, height }: Pixels, { radius, sigma }: Blur): Float32Array {
  const k = gaussianKernel(radius, sigma);
  const tmp = new Float32Array(data.length);
  const out = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let i = -radius; i <= radius; i++) {
        const sx = Math.min(width - 1, Math.max(0, x + i));
        const w = k[i + radius] ?? 0;
        const j = (row + sx) * 4;
        r += (data[j] ?? 0) * w;
        g += (data[j + 1] ?? 0) * w;
        b += (data[j + 2] ?? 0) * w;
        a += (data[j + 3] ?? 0) * w;
      }
      const o = (row + x) * 4;
      tmp[o] = r;
      tmp[o + 1] = g;
      tmp[o + 2] = b;
      tmp[o + 3] = a;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let i = -radius; i <= radius; i++) {
        const sy = Math.min(height - 1, Math.max(0, y + i));
        const w = k[i + radius] ?? 0;
        const j = (sy * width + x) * 4;
        r += (tmp[j] ?? 0) * w;
        g += (tmp[j + 1] ?? 0) * w;
        b += (tmp[j + 2] ?? 0) * w;
        a += (tmp[j + 3] ?? 0) * w;
      }
      const o = (y * width + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = a;
    }
  }
  return out;
}

function gaussianBlur(px: Pixels, blur: Blur): void {
  const b = blurred(px, blur);
  for (let i = 0; i < b.length; i++) px.data[i] = Math.round(b[i] ?? 0);
}

/** Same formula as ImageMagick's -unsharp (threshold is a ratio of QuantumRange). */
function unsharpMask(px: Pixels, u: Unsharp): void {
  const b = blurred(px, u);
  const threshold = 255 * u.threshold;
  const d = px.data;
  for (let i = 0; i < d.length; i++) {
    if (i % 4 === 3) continue;
    const orig = d[i] ?? 0;
    const diff = orig - (b[i] ?? 0);
    if (Math.abs(2 * diff) < threshold) continue;
    d[i] = Math.round(orig + diff * u.gain);
  }
}

export const Filters = {
  hasFilters,
  apply: applyFilters,
} as const;
