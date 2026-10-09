import type { OutputFormat } from "./output-format";
import type { Overlay } from "./overlay";
import type { ThroughFormat } from "./through-format";
import { Transform } from "./transform";

/** Transform parameters for one request. */
export type Params = Readonly<{
  transform: Transform;
  overlays: readonly Overlay[];
  /** Fallback format specs such as `webp:jpg` are kept as an array (first has priority). */
  f: readonly OutputFormat[];
  q: number;
  o: boolean;
  lossless: boolean;
  s: 1 | 2;
  through: readonly ThroughFormat[];
  expires?: Date;
  /** Extension: transform animated images as animations instead of taking only the first frame. */
  anim: boolean;
  /** Parameter names that appeared in the URL (excluding sig). Used to check overridable parameters. */
  keys: readonly string[];
}>;

export const Params = {
  default: {
    transform: Transform.default,
    overlays: [],
    f: ["auto"],
    q: 75,
    o: true,
    lossless: false,
    s: 1,
    through: [],
    anim: false,
    keys: [],
  } as const satisfies Params,
} as const;
