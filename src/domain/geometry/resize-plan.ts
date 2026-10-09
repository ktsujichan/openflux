import { type Result, err, ok } from "neverthrow";

import { Gravity } from "../params/gravity";
import type { Transform } from "../params/transform";
import { assertNever } from "../shared/assert-never";
import { anchor } from "./anchor";
import type { GeometryError } from "./geometry-error";
import type { Size } from "./size";

/** Maximum output width/height. */
const MAX_DIMENSION = 16383;

/** Scaling method and output size. */
export type ResizePlan =
  | Readonly<{ kind: "None" }>
  /** Stretch to width x height ignoring aspect ratio. */
  | Readonly<{ kind: "Scale"; width: number; height: number }>
  /** Scale to cover width x height and crop the overflow according to gravity. */
  | Readonly<{ kind: "Cover"; width: number; height: number; gravity: Gravity }>
  /** Scale to inner and fill the rest of the canvas with the background color. */
  | Readonly<{ kind: "Pad"; inner: Size; canvas: Size; offset: Readonly<{ left: number; top: number }> }>;

type ResizeParams = Pick<Transform, "w" | "h" | "a" | "u" | "dpr" | "g">;

const atLeast1 = (n: number) => Math.max(1, n);

/** Fit while preserving aspect ratio (only one of w/h given, or a=0). */
const planFit = (src: Size, t: ResizeParams, d: (n: number) => number): ResizePlan => {
  const fit = (): Size => {
    if (t.h === undefined)
      return { width: t.w ?? src.width, height: atLeast1(Math.round((src.height * (t.w ?? src.width)) / src.width)) };
    if (t.w === undefined) return { width: atLeast1(Math.round((src.width * t.h) / src.height)), height: t.h };
    const s = Math.min(t.w / src.width, t.h / src.height);
    return { width: atLeast1(Math.round(src.width * s)), height: atLeast1(Math.round(src.height * s)) };
  };
  const { width, height } = fit();
  const scaled = { width: d(width), height: d(height) };
  if (!t.u && (scaled.width > src.width || scaled.height > src.height)) return { kind: "None" };
  return { kind: "Scale", ...scaled };
};

/** Both w and h given (a=1/2/3). See test/domain/geometry.test.ts for how u=0 is handled. */
const planBox = (src: Size, t: ResizeParams & { w: number; h: number }, d: (n: number) => number): ResizePlan => {
  const width = d(t.w);
  const height = d(t.h);
  const clamped = t.u ? { width, height } : { width: Math.min(width, src.width), height: Math.min(height, src.height) };
  switch (t.a) {
    case 0:
      return planFit(src, t, d);
    case 1:
      return { kind: "Scale", ...clamped };
    case 2:
      return { kind: "Cover", ...clamped, gravity: t.g };
    case 3: {
      const s = Math.min(width / src.width, height / src.height, t.u ? Infinity : 1);
      const inner = { width: atLeast1(Math.round(src.width * s)), height: atLeast1(Math.round(src.height * s)) };
      const [fx, fy] = Gravity.factor(t.g);
      return {
        kind: "Pad",
        inner,
        canvas: { width, height },
        offset: { left: anchor(width, inner.width, 0, fx), top: anchor(height, inner.height, 0, fy) },
      };
    }
    default:
      return assertNever(t.a);
  }
};

export const ResizePlan = {
  outputSize: (plan: ResizePlan, src: Size): Size => {
    switch (plan.kind) {
      case "None":
        return src;
      case "Scale":
      case "Cover":
        return { width: plan.width, height: plan.height };
      case "Pad":
        return plan.canvas;
      default:
        return assertNever(plan);
    }
  },

  /** Decides the scaling method from w, h, a, u, dpr and g. Output larger than 16383px is an error. */
  plan: (src: Size, t: ResizeParams): Result<ResizePlan, GeometryError> => {
    const dpr = t.dpr ?? 1;
    const d = (n: number) => atLeast1(Math.round(n * dpr));
    const plan = ((): ResizePlan => {
      if (t.w === undefined && t.h === undefined) {
        if (t.dpr === undefined || (!t.u && dpr > 1)) return { kind: "None" };
        return { kind: "Scale", width: d(src.width), height: d(src.height) };
      }
      if (t.w === undefined || t.h === undefined) return planFit(src, t, d);
      return planBox(src, { ...t, w: t.w, h: t.h }, d);
    })();
    const out = ResizePlan.outputSize(plan, src);
    return out.width > MAX_DIMENSION || out.height > MAX_DIMENSION
      ? err({ kind: "OutputTooLarge", max: MAX_DIMENSION })
      : ok(plan);
  },
} as const;
