// Expected values are taken from actual demo.imageflux.jp output (e.g. a 300x200 image from bridge.jpg at w=300)
import { describe, expect, it } from "vitest";

import { CropArea } from "../../src/domain/geometry/crop-area";
import { OverlayPlacement } from "../../src/domain/geometry/overlay-placement";
import { ResizePlan } from "../../src/domain/geometry/resize-plan";
import type { Size } from "../../src/domain/geometry/size";
import { ParseParams } from "../../src/domain/params/parse-params";
import { Transform } from "../../src/domain/params/transform";

const base = { width: 300, height: 200 } as const satisfies Size;
const transform = (raw: string) => ParseParams.parse(raw)._unsafeUnwrap().transform;
const plan = (src: Size, raw: string) => ResizePlan.plan(src, transform(raw))._unsafeUnwrap();
const out = (src: Size, raw: string) => ResizePlan.outputSize(plan(src, raw), src);

const outputCrop = (raw: string) => {
  const t = transform(raw);
  if (!t.oc) throw new Error(`oc is missing in ${raw}`);
  return CropArea.resolve(base, t.oc, Transform.outputGravity(t));
};

describe("CropArea (oc/ic + og/ig)", () => {
  it.each([
    ["oc=0:0:100:50,og=1", { left: 0, top: 0, width: 100, height: 50 }],
    ["oc=0:0:100:50,og=5", { left: 100, top: 75, width: 100, height: 50 }],
    ["oc=0:0:100:50,og=9", { left: 200, top: 150, width: 100, height: 50 }],
    ["oc=10:20:110:70,og=1", { left: 10, top: 20, width: 100, height: 50 }],
    ["oc=10:20:110:70,og=5", { left: 110, top: 95, width: 100, height: 50 }],
    ["oc=10:20:110:70,og=9", { left: 190, top: 130, width: 100, height: 50 }],
    ["oc=10:20:110:70,og=3", { left: 190, top: 20, width: 100, height: 50 }],
    ["ocr=0.25:0.25:0.75:0.75,og=1", { left: 75, top: 50, width: 150, height: 100 }],
    ["ocr=0.25:0.25:0.75:0.75,og=5", { left: 150, top: 100, width: 150, height: 100 }],
    ["ocr=0.1:0.1:0.4:0.3,og=9", { left: 180, top: 140, width: 90, height: 40 }],
    ["oc=250:150:400:300,og=1", { left: 250, top: 150, width: 50, height: 50 }],
    ["oc=50:0:10:10,og=1", { left: 10, top: 0, width: 40, height: 10 }],
  ])("%s", (raw, rect) => {
    expect(outputCrop(raw)._unsafeUnwrap()).toEqual(rect);
  });

  it("uses g when og is not specified", () => {
    expect(outputCrop("oc=0:0:100:50,g=9")._unsafeUnwrap()).toMatchObject({ left: 200, top: 150 });
  });

  it("a region outside the image is an error", () => {
    expect(outputCrop("oc=400:300:500:400,og=1")._unsafeUnwrapErr()).toEqual({ kind: "ClipOutOfImage" });
  });
});

describe("ResizePlan", () => {
  // Approximates the actual size of bridge.jpg (about 5684x3789) as 3:2
  const big = { width: 6000, height: 4000 } as const satisfies Size;
  it.each([
    ["w=301", { width: 301, height: 201 }],
    ["h=201", { width: 302, height: 201 }],
    ["w=300,h=300", { width: 300, height: 300 }],
    ["w=300,h=300,a=0", { width: 300, height: 200 }],
    ["w=300,h=300,a=2", { width: 300, height: 300 }],
    ["w=300,h=300,a=3", { width: 300, height: 300 }],
    ["w=240,h=180,dpr=1.5", { width: 360, height: 270 }],
    ["w=241,dpr=1.5", { width: 362, height: 242 }],
    ["a=2,w=300", { width: 300, height: 200 }],
  ])("%s", (raw, size) => {
    expect(out(big, raw)).toEqual(size);
  });

  it.each([
    ["w=600,h=600,a=0,u=0", { width: 300, height: 200 }],
    ["w=600,h=600,a=1,u=0", { width: 300, height: 200 }],
    ["w=600,h=600,a=2,u=0", { width: 300, height: 200 }],
    ["w=600,h=600,a=3,u=0", { width: 600, height: 600 }],
    ["w=400,h=150,a=2,u=0", { width: 300, height: 150 }],
    ["w=400,h=150,a=3,u=0", { width: 400, height: 150 }],
    ["w=400,h=150,a=1,u=0", { width: 300, height: 150 }],
    ["w=200,h=400,a=1,u=0", { width: 200, height: 200 }],
    ["w=400,u=0", { width: 300, height: 200 }],
    ["dpr=2,u=0", { width: 300, height: 200 }],
    ["w=200,dpr=2,u=0", { width: 300, height: 200 }],
  ])("u=0: %s (input 300x200)", (raw, size) => {
    expect(out(base, raw)).toEqual(size);
  });

  it("a=3 adds padding according to g", () => {
    expect(plan(base, "w=300,h=300,a=3,g=1")).toMatchObject({
      kind: "Pad",
      inner: { width: 300, height: 200 },
      offset: { left: 0, top: 0 },
    });
    expect(plan(base, "w=300,h=300,a=3,g=9")).toMatchObject({ offset: { left: 0, top: 100 } });
    expect(plan(base, "w=300,h=300,a=3")).toMatchObject({ offset: { left: 0, top: 50 } });
  });

  it("output larger than 16383px is an error", () => {
    const tooLarge = { kind: "OutputTooLarge", max: 16383 } as const;
    expect(ResizePlan.plan(big, transform("w=16384,h=10"))._unsafeUnwrapErr()).toEqual(tooLarge);
    expect(ResizePlan.plan(big, transform("w=100000"))._unsafeUnwrapErr()).toEqual(tooLarge);
  });

  it("does not transform without parameters", () => {
    expect(ResizePlan.plan(base, Transform.default)._unsafeUnwrap()).toEqual({ kind: "None" });
  });
});

describe("OverlayPlacement", () => {
  const logo = { width: 60, height: 20 } as const satisfies Size;
  const origin = (raw: string) => {
    const o = ParseParams.parse(raw)._unsafeUnwrap().overlays[0];
    if (!o) throw new Error(`overlay is missing in ${raw}`);
    return OverlayPlacement.origin(base, logo, o.position);
  };
  it.each([
    ["l=(w=60%2fa.png)", { left: 120, top: 90 }],
    ["l=(lg=1,w=60%2fa.png)", { left: 0, top: 0 }],
    ["l=(lg=1,x=10,y=20,w=60%2fa.png)", { left: 10, top: 20 }],
    ["l=(lg=9,x=10,y=20,w=60%2fa.png)", { left: 230, top: 160 }],
    ["l=(lg=5,x=10,y=20,w=60%2fa.png)", { left: 130, top: 110 }],
    ["l=(lg=9,x=-10,y=-20,w=60%2fa.png)", { left: 250, top: 200 }],
    ["l=(lg=1,xr=0.5,yr=0.25,w=60%2fa.png)", { left: 150, top: 50 }],
    ["l=(lg=9,xr=0.1,yr=0.1,w=60%2fa.png)", { left: 210, top: 160 }],
    ["l=%2fa.png,lx=5,ly=6,lg=1", { left: 5, top: 6 }],
  ])("%s", (raw, expected) => {
    expect(origin(raw)).toEqual(expected);
  });
});
