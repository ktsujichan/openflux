import type { Result } from "neverthrow";

import type { ParamError } from "./param-error";
import { oneOf, parseUint } from "./value-parsers";

const GRAVITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Gravity origin. 1: top-left … 5: center … 9: bottom-right */
export type Gravity = (typeof GRAVITIES)[number];

export const Gravity = {
  center: 5 as const satisfies Gravity,

  parse: (key: string, v: string): Result<Gravity, ParamError> =>
    parseUint(key, v).andThen((n) => oneOf(key, GRAVITIES, n)),

  /** (horizontal, vertical), each as 0 / 0.5 / 1. */
  factor: (g: Gravity): readonly [number, number] => {
    const i = g - 1;
    return [(i % 3) / 2, Math.floor(i / 3) / 2];
  },
} as const;
