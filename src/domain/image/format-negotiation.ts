import { type ImageFormat, OutputFormat } from "../params/output-format";
import type { InputFormat } from "./input-format";

export type Negotiation = Readonly<{ choice: OutputFormat; negotiated: boolean }>;

export const FormatNegotiation = {
  /** Whether the Accept header explicitly accepts mime (with q>0). */
  accepts: (accept: string | null, mime: string): boolean =>
    (accept ?? "").split(",").some((part) => {
      const [type, ...params] = part
        .trim()
        .split(";")
        .map((s) => s.trim());
      if (type?.toLowerCase() !== mime) return false;
      const q = params.find((p) => p.startsWith("q="));
      return q === undefined || Number(q.slice(2)) > 0;
    }),

  /**
   * Decides the output format from the f parameter and the Accept header.
   * With multiple candidates such as `webp:jpg`, picks the first one the client accepts; the last candidate is used unconditionally.
   */
  negotiate: (spec: readonly OutputFormat[], accept: string | null): Negotiation => {
    const negotiated = spec.length > 1;
    const accepted = spec
      .slice(0, -1)
      .find((f) => f !== "auto" && FormatNegotiation.accepts(accept, OutputFormat.mime[f]));
    return { choice: accepted ?? spec[spec.length - 1] ?? "auto", negotiated };
  },

  /** Output format for f=auto (same as input; formats browsers cannot display, such as HEIC, become JPEG). */
  resolveAuto: (choice: Exclude<OutputFormat, "mp4">, input: InputFormat): ImageFormat => {
    if (choice !== "auto") return choice;
    switch (input) {
      case "png":
      case "gif":
      case "webp":
      case "avif":
      case "jxl":
        return input;
      default:
        return "jpeg";
    }
  },
} as const;
