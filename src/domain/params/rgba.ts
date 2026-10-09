import { type Result, err, ok } from "neverthrow";

import type { ParamError } from "./param-error";

/** 8bit RGBA. Used for the b parameter and text color. */
export type Rgba = Readonly<{ r: number; g: number; b: number; a: number }>;

export const Rgba = {
  white: { r: 255, g: 255, b: 255, a: 255 } as const satisfies Rgba,
  black: { r: 0, g: 0, b: 0, a: 255 } as const satisfies Rgba,
  transparentWhite: { r: 255, g: 255, b: 255, a: 0 } as const satisfies Rgba,

  /** RRGGBB or RRGGBBAA. */
  parse: (key: string, v: string): Result<Rgba, ParamError> => {
    if (!/^([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) return err({ kind: "InvalidColor", key, value: v });
    const n = (i: number) => parseInt(v.slice(i, i + 2), 16);
    return ok({ r: n(0), g: n(2), b: n(4), a: v.length === 8 ? n(6) : 255 });
  },

  css: (c: Rgba): string => `rgba(${c.r},${c.g},${c.b},${Number((c.a / 255).toFixed(4))})`,

  opaque: (c: Rgba): Rgba => ({ ...c, a: 255 }),
} as const;
