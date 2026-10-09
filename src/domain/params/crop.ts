import { Result, err, ok } from "neverthrow";

import type { ParamError } from "./param-error";
import { parseFloatValue, parseUint } from "./value-parsers";

/** ic/oc specify pixels (Pixel); icr/ocr specify ratios of the image size (Ratio). */
export type Crop = Readonly<{ kind: "Pixel" | "Ratio"; x1: number; y1: number; x2: number; y2: number }>;

export const Crop = {
  parse: (key: string, v: string, kind: Crop["kind"]): Result<Crop, ParamError> => {
    const parts = v.split(":");
    if (parts.length !== 4) return err({ kind: "InvalidValue", key, value: v });
    const numbers = Result.combine(parts.map((p) => (kind === "Ratio" ? parseFloatValue(key, p) : parseUint(key, p))));
    return numbers.andThen(([x1 = 0, y1 = 0, x2 = 0, y2 = 0]): Result<Crop, ParamError> =>
      kind === "Ratio" && [x1, y1, x2, y2].some((n) => n < 0 || n > 1)
        ? err({ kind: "OutOfRange", key })
        : ok({ kind, x1, y1, x2, y2 }),
    );
  },
} as const;
