import { type Result, ok } from "neverthrow";

import type { ParamError } from "./param-error";
import { oneOf, parseUint } from "./value-parsers";

const ORIENTATIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Value of ir/or. Inverse of an Exif Orientation (1–8) or auto. */
export type Orientation = (typeof ORIENTATIONS)[number] | "auto";

/** Cloudflare Images applies flip → rotate (clockwise) in that order. */
export type FlipRotate = Readonly<{ flip?: "h" | "v"; rotate?: 90 | 180 | 270 }>;

export const Orientation = {
  parse: (key: string, v: string): Result<Orientation, ParamError> =>
    v === "auto" ? ok("auto") : parseUint(key, v).andThen((n) => oneOf(key, ORIENTATIONS, n)),

  swapsAxes: (o: Orientation | undefined): boolean => typeof o === "number" && o >= 5,

  toFlipRotate: (o: Exclude<Orientation, "auto">): FlipRotate => {
    switch (o) {
      case 1:
        return {};
      case 2:
        return { flip: "h" };
      case 3:
        return { rotate: 180 };
      case 4:
        return { flip: "v" };
      case 5:
        return { flip: "h", rotate: 270 };
      case 6:
        return { rotate: 270 };
      case 7:
        return { flip: "h", rotate: 90 };
      case 8:
        return { rotate: 90 };
    }
  },
} as const;
