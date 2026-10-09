import type { InputFormat } from "./input-format";

/** Input format that cannot be transformed (SVG, BMP, etc.). */
export type UnsupportedInput = Readonly<{ kind: "UnsupportedInput"; format: InputFormat }>;
