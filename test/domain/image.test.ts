// Expected values for filters, masks and line layout are taken from actual demo.imageflux.jp output
import { describe, expect, it } from "vitest";

import type { Size } from "../../src/domain/geometry/size";
import { Filters } from "../../src/domain/image/filters";
import { FontResolution } from "../../src/domain/image/font-resolution";
import { FormatNegotiation } from "../../src/domain/image/format-negotiation";
import { InputFormat } from "../../src/domain/image/input-format";
import { JpegHeader } from "../../src/domain/image/jpeg-header";
import { MaskCompositing } from "../../src/domain/image/mask-compositing";
import type { Pixels } from "../../src/domain/image/pixels";
import { SupportAssessment } from "../../src/domain/image/support-assessment";
import { TextLayout } from "../../src/domain/image/text-layout";
import type { TextOverlay } from "../../src/domain/params/overlay";
import { ParseParams } from "../../src/domain/params/parse-params";
import { solidPng } from "../../src/infrastructure/solid-png";

const pixels = (w: number, h: number, rgba: readonly number[]): Pixels => ({
  data: new Uint8ClampedArray(Array.from({ length: w * h }, () => rgba).flat()),
  width: w,
  height: h,
});

describe("Filters (demo.imageflux.jp output values)", () => {
  const base = [
    [0, 41, 63],
    [3, 65, 89],
    [3, 90, 117],
    [1, 77, 107],
    [186, 196, 184],
  ];
  const expected: Readonly<Record<string, readonly (readonly number[])[]>> = {
    "grayscale=100": [
      [33, 33, 33],
      [53, 53, 53],
      [73, 73, 73],
      [63, 63, 63],
      [193, 193, 193],
    ],
    "grayscale=50": [
      [16, 37, 48],
      [28, 59, 71],
      [38, 81, 95],
      [32, 70, 85],
      [189, 194, 188],
    ],
    "sepia=100": [
      [43, 38, 30],
      [67, 60, 47],
      [92, 82, 64],
      [79, 71, 55],
      [255, 230, 179],
    ],
    "sepia=50": [
      [21, 39, 46],
      [35, 62, 68],
      [47, 86, 90],
      [40, 74, 81],
      [222, 213, 181],
    ],
    "brightness=50": [
      [0, 20, 31],
      [1, 32, 44],
      [1, 45, 58],
      [0, 38, 53],
      [93, 98, 92],
    ],
    "brightness=200": [
      [0, 82, 126],
      [6, 130, 178],
      [6, 180, 234],
      [2, 154, 214],
      [255, 255, 255],
    ],
    "contrast=50": [
      [63, 84, 95],
      [65, 96, 108],
      [65, 108, 122],
      [64, 102, 117],
      [156, 161, 155],
    ],
    "contrast=200": [
      [0, 0, 0],
      [0, 2, 50],
      [0, 52, 106],
      [0, 26, 86],
      [244, 255, 240],
    ],
    "invert=1": [
      [255, 214, 192],
      [252, 190, 166],
      [252, 165, 138],
      [254, 178, 148],
      [69, 59, 71],
    ],
    "grayscale=100,invert=1": [
      [222, 222, 222],
      [202, 202, 202],
      [182, 182, 182],
      [192, 192, 192],
      [62, 62, 62],
    ],
  };
  it.each(Object.entries(expected))("%s", (raw, rows) => {
    const px: Pixels = {
      data: new Uint8ClampedArray(base.flatMap(([r = 0, g = 0, b = 0]) => [r, g, b, 255])),
      width: base.length,
      height: 1,
    };
    Filters.apply(px, ParseParams.parse(raw)._unsafeUnwrap().transform);
    const got = base.map((_, i) => [px.data[i * 4], px.data[i * 4 + 1], px.data[i * 4 + 2]]);
    // Allow up to ±1 difference from measured values due to rounding
    got.forEach((p, i) => p.forEach((v, c) => expect(Math.abs((v ?? 0) - (rows[i]?.[c] ?? 0))).toBeLessThanOrEqual(1)));
  });
});

describe("MaskCompositing", () => {
  it("white mask luminance (Rec.709 luminance in linear RGB converted back to sRGB)", () => {
    const samples = [
      [0, 7, 30, 8],
      [3, 88, 114, 80],
      [0, 36, 58, 33],
      [1, 41, 62, 37],
      [1, 29, 51, 27],
      [4, 99, 124, 90],
      [1, 44, 67, 40],
    ] as const;
    // Allow up to ±1 difference from measured values due to rounding (6 of 7 points match exactly)
    for (const [r, g, b, v] of samples) expect(Math.abs(MaskCompositing.luminance(r, g, b) - v)).toBeLessThanOrEqual(1);
  });

  it("alpha: multiplies base alpha by mask alpha; the outside is determined by padding", () => {
    const mask = pixels(1, 1, [68, 122, 242, 149]);
    const base0 = pixels(3, 1, [10, 20, 30, 255]);
    MaskCompositing.apply(base0, mask, { left: 1, top: 0 }, { kind: "Alpha", padding: 0 }, true);
    expect([...base0.data]).toEqual([10, 20, 30, 0, 10, 20, 30, 149, 10, 20, 30, 0]);
    const base1 = pixels(3, 1, [10, 20, 30, 255]);
    MaskCompositing.apply(base1, mask, { left: 1, top: 0 }, { kind: "Alpha", padding: 1 }, true);
    expect([...base1.data]).toEqual([10, 20, 30, 255, 10, 20, 30, 149, 10, 20, 30, 255]);
  });

  it("white / black ignore mask alpha and use luminance", () => {
    const mask = pixels(1, 1, [3, 88, 114, 0]);
    const white = pixels(1, 1, [0, 0, 0, 255]);
    MaskCompositing.apply(white, mask, { left: 0, top: 0 }, { kind: "White", padding: 0 }, true);
    expect(white.data[3]).toBe(80);
    const black = pixels(1, 1, [0, 0, 0, 255]);
    MaskCompositing.apply(black, mask, { left: 0, top: 0 }, { kind: "Black", padding: 0 }, true);
    expect(black.data[3]).toBe(175);
  });

  it("alpha on an image without an alpha channel is treated as white", () => {
    const base = pixels(1, 1, [0, 0, 0, 255]);
    MaskCompositing.apply(
      base,
      pixels(1, 1, [3, 88, 114, 255]),
      { left: 0, top: 0 },
      { kind: "Alpha", padding: 0 },
      false,
    );
    expect(base.data[3]).toBe(80);
  });
});

describe("TextLayout (measured with Ryumin R-KL size=30: natural line height 40px)", () => {
  const line = { width: 50, height: 40 } as const satisfies Size;
  const tops = (linespacing: number, n: number) =>
    TextLayout.layout(
      Array.from({ length: n }, () => line),
      { align: 0, linespacing, strike: false },
    ).lines.map((l) => l.top);

  it.each([
    [0, 3, [0, 40, 80]],
    [0.5, 4, [0, 40, 80, 120]],
    [1, 3, [0, 80, 160]],
    [1.5, 2, [0, 120]],
    [0.25, 4, [0, 20, 40, 60]],
    [-0.25, 2, [0, -20]],
  ])("linespacing=%s", (ls, n, expected) => {
    expect(tops(ls, n)).toEqual(expected);
  });

  it("align applies per line", () => {
    const l = TextLayout.layout([line, { width: 100, height: 40 }], {
      w: 300,
      align: 2,
      linespacing: 0,
      strike: false,
    });
    expect(l.lines.map((p) => p.left)).toEqual([250, 200]);
    expect(l.area).toEqual({ width: 300, height: 80 });
  });

  it("strikethrough at 60% of the line height (around 24px at size=30, around 48px at size=60)", () => {
    const [s30] = TextLayout.layout([line], { align: 0, linespacing: 0, strike: true }).strikes;
    expect(s30?.top).toBeLessThanOrEqual(24);
    expect((s30?.top ?? 0) + (s30?.height ?? 0)).toBeGreaterThan(24);
    const [s60] = TextLayout.layout([{ width: 50, height: 80 }], { align: 0, linespacing: 0, strike: true }).strikes;
    expect(s60?.top).toBeLessThanOrEqual(48);
    expect((s60?.top ?? 0) + (s60?.height ?? 0)).toBeGreaterThan(48);
    expect(s60?.width).toBe(50);
  });

  it("no strikethrough on empty lines", () => {
    expect(
      TextLayout.layout([line, { width: 0, height: 40 }], { align: 0, linespacing: 0, strike: true }).strikes,
    ).toHaveLength(1);
  });
});

describe("InputFormat", () => {
  const text = (s: string) => new TextEncoder().encode(s);
  it("sniff", () => {
    expect(InputFormat.sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(InputFormat.sniff(solidPng(0, 0, 0, 0))).toBe("png");
    expect(InputFormat.sniff(text("GIF89a"))).toBe("gif");
    expect(InputFormat.sniff(text("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
    expect(InputFormat.sniff(new Uint8Array([0xff, 0x0a, 0, 0]))).toBe("jxl");
    expect(InputFormat.sniff(text("\0\0\0\x1cftypavif\0\0\0\0avifmif1"))).toBe("avif");
    expect(InputFormat.sniff(text("\0\0\0\x18ftypheic\0\0\0\0mif1heic"))).toBe("heic");
    expect(InputFormat.sniff(text('<?xml version="1.0"?><svg xmlns="..."/>'))).toBe("svg");
  });

  it("hasAlphaChannel (PNG color type and JPEG)", () => {
    expect(InputFormat.hasAlphaChannel(solidPng(0, 0, 0, 0), "png")).toBe(true);
    const rgb = solidPng(0, 0, 0, 0);
    rgb[25] = 2;
    expect(InputFormat.hasAlphaChannel(rgb, "png")).toBe(false);
    expect(InputFormat.hasAlphaChannel(new Uint8Array([0xff, 0xd8, 0xff]), "jpeg")).toBe(false);
  });

  it("through", () => {
    expect(InputFormat.shouldPassThrough("gif", ["gif"], true)).toBe(true);
    expect(InputFormat.shouldPassThrough("jpeg", ["jpg"], true)).toBe(true);
    expect(InputFormat.shouldPassThrough("svg", ["auto"], true)).toBe(true);
    expect(InputFormat.shouldPassThrough("heic", ["auto"], false)).toBe(true);
    expect(InputFormat.shouldPassThrough("heic", ["auto"], true)).toBe(false);
    expect(InputFormat.shouldPassThrough("png", ["gif", "auto"], true)).toBe(false);
  });
});

describe("FormatNegotiation", () => {
  it("negotiation by Accept", () => {
    expect(FormatNegotiation.accepts("image/avif,image/webp,*/*", "image/webp")).toBe(true);
    expect(FormatNegotiation.accepts("image/webp;q=0,*/*", "image/webp")).toBe(false);
    expect(FormatNegotiation.accepts("*/*", "image/webp")).toBe(false);
    expect(FormatNegotiation.negotiate(["webp", "auto"], "image/webp")).toEqual({ choice: "webp", negotiated: true });
    expect(FormatNegotiation.negotiate(["webp", "auto"], "*/*")).toEqual({ choice: "auto", negotiated: true });
    expect(FormatNegotiation.negotiate(["jxl", "avif", "jpeg"], "image/avif,image/webp")).toEqual({
      choice: "avif",
      negotiated: true,
    });
    expect(FormatNegotiation.negotiate(["webp"], null)).toEqual({ choice: "webp", negotiated: false });
  });

  it("auto is the same as the input (HEIC becomes JPEG)", () => {
    expect(FormatNegotiation.resolveAuto("auto", "png")).toBe("png");
    expect(FormatNegotiation.resolveAuto("auto", "heic")).toBe("jpeg");
    expect(FormatNegotiation.resolveAuto("webp", "png")).toBe("webp");
  });
});

describe("FontResolution / SupportAssessment", () => {
  const catalog = {
    fonts: new Map([
      ["Noto", "https://fonts.example.com/noto.woff2"],
      ["Noto:Bold", "https://fonts.example.com/noto-bold.woff2"],
      ["Noto:wdth=100,wght=700", "https://fonts.example.com/noto-700.woff2"],
    ]),
    defaultFont: "Noto",
  };
  const textOverlay = (raw: string): TextOverlay => {
    const o = ParseParams.parse(raw)._unsafeUnwrap().overlays[0];
    if (o?.kind !== "Text") throw new Error("text overlay expected");
    return o;
  };

  it("looks up by named instance / variation axes (in tag order)", () => {
    expect(FontResolution.resolve(catalog, textOverlay("t=(font=(Noto,instance=Bold),text=a)"))).toEqual({
      kind: "Resolved",
      url: "https://fonts.example.com/noto-bold.woff2",
      ignored: [],
    });
    expect(
      FontResolution.resolve(catalog, textOverlay("t=(font=(Noto,var=wght:700,var=wdth:100),text=a)")),
    ).toMatchObject({
      url: "https://fonts.example.com/noto-700.woff2",
    });
  });

  it("draws unregistered instances with the regular font and records them as ignored", () => {
    expect(FontResolution.resolve(catalog, textOverlay("t=(font=(Noto,instance=Light),text=a)"))).toEqual({
      kind: "Resolved",
      url: "https://fonts.example.com/noto.woff2",
      ignored: ["font-variation (Noto:Light)"],
    });
  });

  it("errors on unsupported features when strict, otherwise lists ignored features", () => {
    const params = ParseParams.parse("t=(wrap=1,text=a),l=(w=10%2fa.png)")._unsafeUnwrap();
    expect(SupportAssessment.assess(params, catalog, false)._unsafeUnwrap()).toEqual({
      ignored: ["t.wrap"],
      fonts: ["https://fonts.example.com/noto.woff2", undefined],
    });
    expect(SupportAssessment.assess(params, catalog, true)._unsafeUnwrapErr()).toEqual({
      kind: "UnsupportedFeature",
      feature: "t.wrap",
    });
  });

  it("does not draw text when no font is registered", () => {
    const params = ParseParams.parse("t=(text=a)")._unsafeUnwrap();
    expect(SupportAssessment.assess(params, { fonts: new Map() }, false)._unsafeUnwrap()).toEqual({
      ignored: ["t (no font configured)"],
      fonts: [undefined],
    });
  });
});

describe("JpegHeader", () => {
  it("reads Orientation and SOF dimensions", () => {
    // SOI, APP1(Exif, II, IFD0: Orientation=6), SOF0(h=100, w=200)
    const tiff = [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0];
    const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const bytes = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe1,
      0,
      app1.length + 2,
      ...app1,
      0xff,
      0xc0,
      0,
      11,
      8,
      0,
      100,
      0,
      200,
      1,
      1,
      0x11,
      0,
    ]);
    expect(JpegHeader.read(bytes)).toEqual({ orientation: 6, width: 200, height: 100 });
  });
});
