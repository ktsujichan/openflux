import { type Result, err, ok } from "neverthrow";

import type { ParamError } from "./param-error";

/** Value of the f parameter. avif / jxl are OpenFlux extensions. */
export type OutputFormat = "auto" | "jpeg" | "png" | "gif" | "webp" | "avif" | "jxl" | "mp4";
export type ConcreteFormat = Exclude<OutputFormat, "auto">;
/** Formats that can be output as images (everything but mp4). */
export type ImageFormat = Exclude<ConcreteFormat, "mp4">;

const ALIASES = {
  auto: "auto",
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  gif: "gif",
  webp: "webp",
  avif: "avif",
  jxl: "jxl",
  mp4: "mp4",
} as const satisfies Record<string, OutputFormat>;

/** Formats negotiable via the Accept header (may be followed by fallback formats). */
const NEGOTIABLE: ReadonlySet<OutputFormat> = new Set(["webp", "avif", "jxl"]);

const lookup = (s: string): OutputFormat | undefined =>
  Object.entries(ALIASES).find(([name]) => name === s.toLowerCase())?.[1];

export const OutputFormat = {
  all: ["auto", "jpeg", "png", "gif", "webp", "avif", "jxl"] as const satisfies readonly OutputFormat[],

  mime: {
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    jxl: "image/jxl",
    mp4: "video/mp4",
  } as const satisfies Record<ConcreteFormat, string>,

  /** Fallback format specs such as `webp:jpg` become an array (first has priority). */
  parseList: (v: string): Result<readonly OutputFormat[], ParamError> => {
    const list = v.split(":").map(lookup);
    const formats = list.filter((f) => f !== undefined);
    if (formats.length !== list.length) {
      return err({ kind: "UnsupportedFormat", value: v.split(":").find((s) => !lookup(s)) ?? v });
    }
    const valid =
      formats.slice(0, -1).every((f) => NEGOTIABLE.has(f)) && (formats.length === 1 || !formats.includes("mp4"));
    return valid ? ok(formats) : err({ kind: "UnsupportedFormat", value: v });
  },
} as const;
