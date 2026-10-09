import { type Result, err, ok } from "neverthrow";

import type { ParamError } from "./param-error";

/** Value of the through parameter. avif / jxl / svg are OpenFlux extensions. */
export type ThroughFormat = "jpg" | "png" | "gif" | "webp" | "bmp" | "heic" | "avif" | "jxl" | "svg" | "auto";

const ALIASES = {
  jpg: "jpg",
  jpeg: "jpg",
  png: "png",
  gif: "gif",
  webp: "webp",
  bmp: "bmp",
  heic: "heic",
  avif: "avif",
  jxl: "jxl",
  svg: "svg",
  auto: "auto",
} as const satisfies Record<string, ThroughFormat>;

export const ThroughFormat = {
  parseList: (v: string): Result<readonly ThroughFormat[], ParamError> => {
    const list = v.split(":").map((s) => Object.entries(ALIASES).find(([name]) => name === s.toLowerCase())?.[1]);
    const formats = list.filter((f) => f !== undefined);
    return formats.length === list.length ? ok(formats) : err({ kind: "InvalidValue", key: "through", value: v });
  },
} as const;
