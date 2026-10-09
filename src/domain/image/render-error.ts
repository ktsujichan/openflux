import type { GeometryError } from "../geometry/geometry-error";
import type { OriginRejected } from "../source/origin-rejected";
import type { UnsupportedInput } from "./unsupported-input";

/** Transform failures for which the caller should choose the response. */
export type RenderError =
  | GeometryError
  /** Failed to fetch an overlay image */
  | OriginRejected
  /** The overlay image was in a format that cannot be transformed */
  | UnsupportedInput
  | Readonly<{ kind: "JxlTooLarge"; pixels: number; max: number }>;
