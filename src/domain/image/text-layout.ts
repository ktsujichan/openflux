/**
 * Line layout for text overlays (pure functions). Arranges images drawn one line at a time with Cloudflare Images' text().
 * Spec:
 *   - linespacing=0 is the natural line height. Otherwise "natural line height × 2 × linespacing" (negative overlaps upward)
 *   - align applies per line
 *   - Strikethrough is drawn at 60% of the line height from each line's top, about 1/20 of the line height thick
 */
import type { Rect } from "../geometry/rect";
import type { Size } from "../geometry/size";

export type TextLayoutOptions = Readonly<{
  w?: number;
  h?: number;
  align: 0 | 1 | 2;
  linespacing: number;
  strike: boolean;
}>;

export type TextLayout = Readonly<{
  area: Size;
  /** Top-left coordinate of each line (within the drawing area; may extend outside). */
  lines: readonly Readonly<{ left: number; top: number }>[];
  strikes: readonly Rect[];
}>;

const layout = (lines: readonly Size[], o: TextLayoutOptions): TextLayout => {
  const natural = Math.max(1, ...lines.map((l) => l.height));
  const pitch = o.linespacing === 0 ? natural : o.linespacing * 2 * natural;
  const blockWidth = Math.max(1, ...lines.map((l) => l.width));
  const lastTop = Math.round((lines.length - 1) * pitch);
  const blockHeight = Math.max(natural, lastTop + natural);
  const area = { width: o.w ?? blockWidth, height: o.h ?? blockHeight };

  const thickness = Math.max(1, Math.round(natural / 20));
  const placed = lines.map((l, i) => {
    const left = o.align === 0 ? 0 : o.align === 1 ? Math.floor((area.width - l.width) / 2) : area.width - l.width;
    return { left, top: Math.round(i * pitch) + 0 };
  });
  const strikes: readonly Rect[] = o.strike
    ? placed.flatMap((p, i) => {
        const width = lines[i]?.width ?? 0;
        if (width === 0) return [];
        return [
          {
            left: p.left,
            top: p.top + Math.round(natural * 0.6) - Math.floor(thickness / 2),
            width,
            height: thickness,
          },
        ];
      })
    : [];
  return { area, lines: placed, strikes };
};

export const TextLayout = { layout } as const;
