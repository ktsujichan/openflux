import { describe, expect, it } from "vitest";

import { ParamError } from "../../src/domain/params/param-error";
import { ParseParams } from "../../src/domain/params/parse-params";
import { RequestPath } from "../../src/domain/params/request-path";
import { tokenize } from "../../src/domain/params/token";

const parse = (raw: string) => ParseParams.parse(raw)._unsafeUnwrap();
const errorMessage = (raw: string) => ParamError.message(ParseParams.parse(raw)._unsafeUnwrapErr());
const path = (pathname: string) => RequestPath.parse(pathname)._unsafeUnwrap();

describe("RequestPath", () => {
  it("splits parameters and path", () => {
    expect(path("/w=400/bridge.jpg")).toMatchObject({ rawParams: "w=400", objectPath: "/bridge.jpg" });
    expect(path("/c/w=400/bridge.jpg")).toMatchObject({ prefix: "/c", rawParams: "w=400", objectPath: "/bridge.jpg" });
    expect(path("/c!/w=400/bridge.jpg")).toMatchObject({
      prefix: "/c!",
      rawParams: "w=400",
      objectPath: "/bridge.jpg",
    });
  });

  it("a URL without parameters is the origin path as is", () => {
    expect(path("/bridge.jpg")).toMatchObject({ rawParams: null, objectPath: "/bridge.jpg" });
    expect(path("/images/1.png")).toMatchObject({ rawParams: null, objectPath: "/images/1.png" });
    // demo.imageflux.jp also fetches /c/bridge.jpg from the origin's /c/bridge.jpg
    expect(path("/c/bridge.jpg")).toMatchObject({ rawParams: null, objectPath: "/c/bridge.jpg" });
    expect(path("/foo=bar/x.jpg")).toMatchObject({ rawParams: null, objectPath: "/foo=bar/x.jpg" });
  });

  it("does not split on %2f or / inside overlay values", () => {
    expect(path("/w=400,l=(w=300%2fimages%2f1.png),f=webp:auto/bridge.jpg")).toMatchObject({
      rawParams: "w=400,l=(w=300%2fimages%2f1.png),f=webp:auto",
      objectPath: "/bridge.jpg",
    });
    expect(path("/w=400,l=(w=300/images/1.png)/bridge.jpg").objectPath).toBe("/bridge.jpg");
  });

  it("builds the path to sign without sig (documentation example)", () => {
    expect(path("/c/sig=1.tiKX5u2kw6wp9zDgl1tLiOIi8IsoRIBw8fVgVc0yrNg=,w=200/images/1.jpg")).toMatchObject({
      signature: "1.tiKX5u2kw6wp9zDgl1tLiOIi8IsoRIBw8fVgVc0yrNg=",
      signingPath: "/c/w=200/images/1.jpg",
      objectPath: "/images/1.jpg",
    });
    expect(path("/c/sig=1.-Yd8m-5pXPihiZdlDATcwkkgjzPIC9gFHmmZ3JMxwS0=/images/1.jpg").signingPath).toBe(
      "/images/1.jpg",
    );
    expect(path("/w=200,sig=1.x/images/1.jpg").signingPath).toBe("/w=200/images/1.jpg");
    expect(path("/w=200,sig=1.x,h=10/a.jpg").signingPath).toBe("/w=200,h=10/a.jpg");
  });
});

describe("tokenize", () => {
  it("treats %2c as a separator too", () => {
    const keys = tokenize("w=400%2cl=(w=300%2fimages%2f1.png)%2Cf=webp:auto")
      ._unsafeUnwrap()
      .map((t) => t.key);
    expect(keys).toEqual(["w", "l", "f"]);
  });
  it("empty parameters are an error", () => {
    expect(ParamError.message(tokenize("w=10,,h=10")._unsafeUnwrapErr())).toBe(
      "unexpected char [,], expected a parameter",
    );
  });
});

describe("ParseParams", () => {
  it("defaults", () => {
    const p = parse("");
    expect(p.transform).toMatchObject({ a: 1, g: 5, u: true, b: { r: 255, g: 255, b: 255, a: 255 } });
    expect(p).toMatchObject({ f: ["auto"], q: 75, s: 1, o: true, lossless: false });
  });

  it("last one wins", () => {
    expect(parse("w=10,w=20").transform.w).toBe(20);
  });

  it("aliases c / cr / r", () => {
    const t = parse("c=0:0:10:10,r=6").transform;
    expect(t.oc).toEqual({ kind: "Pixel", x1: 0, y1: 0, x2: 10, y2: 10 });
    expect(t.or).toBe(6);
    expect(parse("cr=0:0:0.5:0.5").transform.oc?.kind).toBe("Ratio");
  });

  it("uses ic when both ic and icr are given", () => {
    expect(parse("icr=0:0:0.5:0.5,ic=0:0:1:1").transform.ic?.kind).toBe("Pixel");
    expect(parse("ic=0:0:1:1,icr=0:0:0.5:0.5").transform.ic?.kind).toBe("Pixel");
  });

  it("filters", () => {
    expect(parse("unsharp=3x3.0+1.0+0.0").transform.unsharp).toEqual({ radius: 3, sigma: 3, gain: 1, threshold: 0 });
    expect(parse("unsharp=2x1.5").transform.unsharp).toEqual({ radius: 2, sigma: 1.5, gain: 1, threshold: 0.05 });
    expect(parse("blur=3x3.0").transform.blur).toEqual({ radius: 3, sigma: 3 });
    expect(ParseParams.parse("blur=3x3.0+1").isErr()).toBe(true);
  });

  it("output format", () => {
    expect(parse("f=webp:auto").f).toEqual(["webp", "auto"]);
    expect(parse("f=webp:jpeg").f).toEqual(["webp", "jpeg"]);
    expect(parse("f=jpg").f).toEqual(["jpeg"]);
    expect(parse("f=jxl:avif:webp:jpg").f).toEqual(["jxl", "avif", "webp", "jpeg"]);
    expect(errorMessage("f=png:jpg")).toBe("invalid or unsupported format: png:jpg");
    expect(errorMessage("f=bmp")).toBe("invalid or unsupported format: bmp");
  });

  it("q=0 is the default", () => {
    expect(parse("q=0").q).toBe(75);
    expect(errorMessage("q=101")).toBe("out of range value");
  });

  it.each([
    ["foo=1", "unexpected char [f], expected a parameter"],
    ["w=abc", "invalid value: w=abc"],
    ["w=0", "out of range value"],
    ["w=-5", "invalid value: w=-5"],
    ["a=4", "out of range value"],
    ["g=0", "out of range value"],
    ["b=fff", "invalid background color: b=fff"],
    ["dpr=6", "dpr value must be smaller than or equal to 5.0"],
    ["expires=2099-01-01T00:00:00%2b09:00", "timezone must be UTC"],
  ])("value validation (400, same as demo.imageflux.jp): %s", (raw, message) => {
    expect(errorMessage(raw)).toBe(message);
  });

  it("background color RGBA", () => {
    expect(parse("b=ff000080").transform.b).toEqual({ r: 255, g: 0, b: 0, a: 128 });
  });

  it("expires", () => {
    expect(parse("expires=2022-12-31T23:59:59Z").expires?.toISOString()).toBe("2022-12-31T23:59:59.000Z");
  });

  it("image overlay (transform parameters and position)", () => {
    const [o] = parse("w=400,l=(w=300,x=10,yr=0.5,lg=9,mask=alpha:1%2fimages%2f1.png),f=webp:auto").overlays;
    expect(o).toMatchObject({
      kind: "Image",
      path: "/images/1.png",
      transform: { w: 300 },
      position: { x: 10, y: 0, yr: 0.5, lg: 9 },
      mask: { kind: "Alpha", padding: 1 },
    });
    expect(errorMessage("l=(f=png%2fa.png)")).toBe("parameter f cannot be specified for overlay");
  });

  it("legacy-style overlay (positions apply regardless of order)", () => {
    expect(parse("l=%2fimages%2f1.png,lx=5,ly=6,lg=1").overlays[0]).toMatchObject({
      kind: "Image",
      path: "/images/1.png",
      position: { x: 5, y: 6, lg: 1 },
    });
  });

  it("text overlay (documentation example)", () => {
    const [o] = parse(
      "w=400,t=(w=400,h=80,align=1,f=ffffff,size=30,font=Ryumin%20R-KL,text=%E3%83%86%E3%82%AD%E3%82%B9%E3%83%88%E3%81%8C%0A%E5%90%88%E6%88%90%E3%81%A7%E3%81%8D%E3%81%BE%E3%81%99)",
    ).overlays;
    expect(o).toMatchObject({
      kind: "Text",
      text: "テキストが\n合成できます",
      w: 400,
      h: 80,
      align: 1,
      size: 30,
      color: { r: 255, g: 255, b: 255, a: 255 },
      fonts: [{ name: "Ryumin R-KL", vars: [] }],
    });
  });

  it("%2c in text is not a separator / variable font spec", () => {
    expect(parse("t=(font=(DriveFlux,var=wght:700),text=a%2cb)").overlays[0]).toMatchObject({
      kind: "Text",
      text: "a,b",
      fonts: [{ name: "DriveFlux", vars: [["wght", 700]] }],
    });
  });

  it("keys exclude sig", () => {
    expect(parse("sig=1.x,w=10,f=png").keys).toEqual(["w", "f"]);
  });

  it("layers onto base (path parameters); keys contain only URL keys", () => {
    const base = parse("w=100,q=50");
    const p = ParseParams.parse("w=200", base)._unsafeUnwrap();
    expect(p).toMatchObject({ transform: { w: 200 }, q: 50, keys: ["w"] });
  });
});
