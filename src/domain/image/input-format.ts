import type { ThroughFormat } from "../params/through-format";

/** Input format detected from magic numbers. */
export type InputFormat = "jpeg" | "png" | "gif" | "webp" | "bmp" | "heic" | "avif" | "jxl" | "svg" | "unknown";

const ascii = (b: Uint8Array, start: number, len: number) => String.fromCharCode(...b.subarray(start, start + len));

/** Input formats transformed by default. */
const BASE_INPUTS: readonly InputFormat[] = ["jpeg", "png", "gif", "webp"];
/** Input formats that Cloudflare Images (or the bundled JXL decoder) can transform. */
const TRANSFORMABLE: readonly InputFormat[] = ["jpeg", "png", "gif", "webp", "heic", "avif", "jxl"];

const ftypBrands = (b: Uint8Array): readonly string[] => {
  const boxSize = Math.min(
    b.length,
    (((b[0] ?? 0) << 24) | ((b[1] ?? 0) << 16) | ((b[2] ?? 0) << 8) | (b[3] ?? 0)) >>> 0,
  );
  const compatible = Array.from({ length: Math.max(0, Math.floor((boxSize - 16) / 4)) }, (_, k) =>
    ascii(b, 16 + k * 4, 4),
  );
  return [ascii(b, 8, 4), ...compatible];
};

export const InputFormat = {
  sniff: (b: Uint8Array): InputFormat => {
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
    if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return "png";
    if (ascii(b, 0, 4) === "GIF8") return "gif";
    if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
    if (b[0] === 0xff && b[1] === 0x0a) return "jxl";
    if (ascii(b, 4, 8) === "JXL \r\n\x87\n") return "jxl";
    if (ascii(b, 4, 4) === "ftyp") {
      const brands = ftypBrands(b);
      if (brands.some((x) => x === "avif" || x === "avis")) return "avif";
      if (brands.some((x) => ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(x)))
        return "heic";
    }
    if (ascii(b, 0, 2) === "BM") return "bmp";
    const head = new TextDecoder().decode(b.subarray(0, 1024)).trimStart();
    if (head.startsWith("<") && head.includes("<svg")) return "svg";
    return "unknown";
  },

  /** Whether the image has an alpha channel. Used for the alpha option of clipping masks. */
  hasAlphaChannel: (b: Uint8Array, format: InputFormat): boolean => {
    switch (format) {
      case "jpeg":
        return false;
      case "png": {
        // IHDR color type: 4 = gray+alpha, 6 = RGBA. Palette etc. are transparent if a tRNS chunk is present
        const colorType = b[25];
        return colorType === 4 || colorType === 6 || new TextDecoder("latin1").decode(b).includes("tRNS");
      }
      case "webp": {
        const chunk = ascii(b, 12, 4);
        if (chunk === "VP8X") return ((b[20] ?? 0) & 0x10) !== 0;
        if (chunk === "VP8L") return (((b[24] ?? 0) >> 4) & 1) === 1;
        return false;
      }
      default:
        return true;
    }
  },

  /** Whether it can be transformed. If extendedInputs is false, only JPEG/PNG/GIF/WebP. */
  isTransformable: (f: InputFormat, extendedInputs: boolean): boolean =>
    (extendedInputs ? TRANSFORMABLE : BASE_INPUTS).includes(f),

  /** Whether to serve as-is without transformation because of the through parameter. */
  shouldPassThrough: (input: InputFormat, through: readonly ThroughFormat[], extendedInputs: boolean): boolean => {
    const name = input === "jpeg" ? "jpg" : input;
    if (through.some((t) => t === name)) return true;
    return through.includes("auto") && !InputFormat.isTransformable(input, extendedInputs);
  },
} as const;
