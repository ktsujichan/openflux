import { type Result, err } from "neverthrow";

import type { ParamError } from "./param-error";
import { oneOf, parseUint } from "./value-parsers";

/**
 * Clipping mask (mask=type[:padding]).
 * padding 0: make the area outside the mask transparent / 1: leave it as is
 */
export type MaskSpec = Readonly<{ kind: "White" | "Black" | "Alpha"; padding: 0 | 1 }>;

const KINDS = { white: "White", black: "Black", alpha: "Alpha" } as const;

export const MaskSpec = {
  parse: (v: string): Result<MaskSpec, ParamError> => {
    const [type = "", padding = "0"] = v.split(":");
    const kind = Object.entries(KINDS).find(([name]) => name === type)?.[1];
    if (!kind) return err({ kind: "InvalidValue", key: "mask", value: v });
    return parseUint("mask", padding)
      .andThen((n) => oneOf("mask", [0, 1] as const, n))
      .map((p) => ({ kind, padding: p }));
  },
} as const;
