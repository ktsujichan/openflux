/**
 * Turns a transform parameter string (`w=400,l=(…),f=webp:auto`, etc.) into Params.
 *
 * Each key is a "handler that validates the value and returns a function (Updater) that updates the target"; the tokens are folded over.
 * If the same key appears more than once, the last one wins (overlays are appended).
 */
import { Result, ok } from "neverthrow";

import { Crop } from "./crop";
import { FontSpec } from "./font-spec";
import { Gravity } from "./gravity";
import { MaskSpec } from "./mask-spec";
import { Orientation } from "./orientation";
import { OutputFormat } from "./output-format";
import type { ImageOverlay, Overlay, TextOverlay } from "./overlay";
import { ParamError } from "./param-error";
import { Params } from "./params";
import { Position } from "./position";
import { Rgba } from "./rgba";
import { ThroughFormat } from "./through-format";
import { type Token, indexOfSlash, tokenize, unwrapParens } from "./token";
import { type AspectMode, type Blur, Transform, type Unsharp } from "./transform";
import { oneOf, parseBool, parseFloatValue, parseInteger, parseUint, safeDecode } from "./value-parsers";

const fail = ParamError.fail;

type Updater<T> = (target: T) => T;
type Handler<T> = (value: string) => Result<Updater<T>, ParamError>;
type Handlers<T> = ReadonlyMap<string, Handler<T>>;

const set =
  <T, K extends keyof T>(key: K) =>
  (value: T[K]): Updater<T> =>
  (target) => ({ ...target, [key]: value });

/** Lifts a handler for a part (P) into a handler for the whole (C) that contains it. */
const lift =
  <P, C>(handler: Handler<P>, get: (c: C) => P, put: (c: C, p: P) => C): Handler<C> =>
  (value) =>
    handler(value).map((update) => (c: C) => put(c, update(get(c))));

const fold = <T>(tokens: readonly Token[], initial: T, apply: (acc: T, t: Token) => Result<T, ParamError>) =>
  tokens.reduce<Result<T, ParamError>>((acc, t) => acc.andThen((v) => apply(v, t)), ok(initial));

// ---- Value parsers ----

const parseGaussian = (key: string, v: string): Result<Blur & { rest: readonly string[] }, ParamError> => {
  const m = /^(\d+)x([0-9.]+)((?:\+[0-9.]+){0,2})$/.exec(v);
  if (!m) return fail({ kind: "InvalidValue", key, value: v });
  const radius = Number(m[1]);
  const sigma = Number(m[2]);
  if (!(radius > 0) || !(sigma > 0)) return fail({ kind: "OutOfRange", key });
  return ok({ radius, sigma, rest: m[3] ? m[3].slice(1).split("+") : [] });
};

const parseUnsharp = (key: string, v: string): Result<Unsharp, ParamError> =>
  parseGaussian(key, v).andThen(({ radius, sigma, rest: [gain, threshold] }) =>
    Result.combine([
      gain === undefined ? ok(1.0) : parseFloatValue(key, gain),
      threshold === undefined ? ok(0.05) : parseFloatValue(key, threshold),
    ]).andThen(([g, th]): Result<Unsharp, ParamError> =>
      th < 0 || th >= 1 ? fail({ kind: "OutOfRange", key }) : ok({ radius, sigma, gain: g, threshold: th }),
    ),
  );

const parseBlur = (key: string, v: string): Result<Blur, ParamError> =>
  parseGaussian(key, v).andThen(({ radius, sigma, rest }): Result<Blur, ParamError> =>
    rest.length ? fail({ kind: "InvalidValue", key, value: v }) : ok({ radius, sigma }),
  );

const parseDpr = (v: string): Result<number, ParamError> =>
  parseFloatValue("dpr", v).andThen((n): Result<number, ParamError> => {
    if (n <= 0) return fail({ kind: "DprNotPositive" });
    if (n > 5) return fail({ kind: "DprTooLarge" });
    return ok(n);
  });

const parseExpires = (v: string): Result<Date, ParamError> => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/.exec(v);
  if (!m) return fail({ kind: "InvalidValue", key: "expires", value: v });
  if (m[8] !== "Z" && m[8] !== "z") return fail({ kind: "TimezoneNotUtc", value: v });
  const d = new Date(v.toUpperCase());
  return Number.isNaN(d.getTime()) ? fail({ kind: "InvalidValue", key: "expires", value: v }) : ok(d);
};

// ---- Transform ----

const transformHandlers: Handlers<Transform> = new Map<string, Handler<Transform>>([
  ["w", (v) => parseUint("w", v, 1).map(set("w"))],
  ["h", (v) => parseUint("h", v, 1).map(set("h"))],
  [
    "a",
    (v) =>
      parseUint("a", v)
        .andThen((n) => oneOf<AspectMode>("a", [0, 1, 2, 3], n))
        .map(set("a")),
  ],
  ["b", (v) => Rgba.parse("b", v).map(set("b"))],
  ["g", (v) => Gravity.parse("g", v).map(set("g"))],
  ["u", (v) => parseBool("u", v).map(set("u"))],
  ["dpr", (v) => parseDpr(v).map(set("dpr"))],
  ["ic", (v) => Crop.parse("ic", v, "Pixel").map(set("ic"))],
  // Specifying both ic and icr is not an error; ic takes precedence
  ["icr", (v) => Crop.parse("icr", v, "Ratio").map((c) => (t) => (t.ic?.kind === "Pixel" ? t : { ...t, ic: c }))],
  ["ig", (v) => Gravity.parse("ig", v).map(set("ig"))],
  ["oc", (v) => Crop.parse("oc", v, "Pixel").map(set("oc"))],
  ["c", (v) => Crop.parse("c", v, "Pixel").map(set("oc"))],
  ["ocr", (v) => Crop.parse("ocr", v, "Ratio").map((c) => (t) => (t.oc?.kind === "Pixel" ? t : { ...t, oc: c }))],
  ["cr", (v) => Crop.parse("cr", v, "Ratio").map((c) => (t) => (t.oc?.kind === "Pixel" ? t : { ...t, oc: c }))],
  ["og", (v) => Gravity.parse("og", v).map(set("og"))],
  ["ir", (v) => Orientation.parse("ir", v).map(set("ir"))],
  ["or", (v) => Orientation.parse("or", v).map(set("or"))],
  ["r", (v) => Orientation.parse("r", v).map(set("or"))],
  ["unsharp", (v) => parseUnsharp("unsharp", v).map(set("unsharp"))],
  ["blur", (v) => parseBlur("blur", v).map(set("blur"))],
  ["grayscale", (v) => parseUint("grayscale", v, 0, 100).map(set("grayscale"))],
  ["sepia", (v) => parseUint("sepia", v, 0, 100).map(set("sepia"))],
  ["brightness", (v) => parseUint("brightness", v).map(set("brightness"))],
  ["contrast", (v) => parseUint("contrast", v).map(set("contrast"))],
  ["invert", (v) => parseBool("invert", v).map(set("invert"))],
]);

/** Transforms allowed on the text drawing area (clipping and rotation/flip only). */
const TEXT_TRANSFORM_KEYS: ReadonlySet<string> = new Set(["oc", "c", "ocr", "cr", "og", "or", "r"]);

// ---- Overlays ----

const positionHandlers: Handlers<Position> = new Map<string, Handler<Position>>([
  ["x", (v) => parseInteger("x", v).map(set("x"))],
  ["y", (v) => parseInteger("y", v).map(set("y"))],
  ["xr", (v) => parseFloatValue("xr", v).map(set("xr"))],
  ["yr", (v) => parseFloatValue("yr", v).map(set("yr"))],
  ["lg", (v) => Gravity.parse("lg", v).map(set("lg"))],
]);

type OverlayFields = Readonly<{ transform: Transform; position: Position }>;

const overlayHandler = <O extends OverlayFields>(key: string): Handler<O> | undefined => {
  const position = positionHandlers.get(key);
  if (position)
    return lift<Position, O>(
      position,
      (o) => o.position,
      (o, p) => ({ ...o, position: p }),
    );
  if (key === "mask") return (v) => MaskSpec.parse(v).map((mask) => (o: O) => ({ ...o, mask }));
  return undefined;
};

const liftTransform = <O extends OverlayFields>(h: Handler<Transform>): Handler<O> =>
  lift<Transform, O>(
    h,
    (o) => o.transform,
    (o, t) => ({ ...o, transform: t }),
  );

const applyImageOverlayKey = (o: ImageOverlay, { key, value }: Token): Result<ImageOverlay, ParamError> =>
  safeDecode(value).andThen((v) => {
    const transform = transformHandlers.get(key);
    const handler = overlayHandler<ImageOverlay>(key) ?? (transform && liftTransform<ImageOverlay>(transform));
    return handler
      ? handler(v).map((update) => update(o))
      : fail({ kind: "OverlayParameterNotAllowed", overlay: "Image", key });
  });

const parseImageOverlay = (inner: string): Result<ImageOverlay, ParamError> =>
  safeDecode(inner).andThen((decoded) => {
    const slash = indexOfSlash(decoded, 0);
    if (slash < 0) return fail({ kind: "OverlayPathMissing", value: decoded });
    const initial: ImageOverlay = {
      kind: "Image",
      path: decoded.slice(slash),
      transform: Transform.default,
      position: Position.default,
    };
    return tokenize(decoded.slice(0, slash)).andThen((tokens) => fold(tokens, initial, applyImageOverlayKey));
  });

const textHandlers: Handlers<TextOverlay> = new Map<string, Handler<TextOverlay>>([
  ["size", (v) => parseFloatValue("size", v).map(set("size"))],
  ["f", (v) => Rgba.parse("f", v).map(set("color"))],
  ["b", (v) => Rgba.parse("b", v).map(set("background"))],
  ["w", (v) => parseUint("w", v, 1).map(set("w"))],
  ["h", (v) => parseUint("h", v, 1).map(set("h"))],
  ["linespacing", (v) => parseFloatValue("linespacing", v).map(set("linespacing"))],
  [
    "align",
    (v) =>
      parseUint("align", v)
        .andThen((n) => oneOf("align", [0, 1, 2] as const, n))
        .map(set("align")),
  ],
  [
    "dir",
    (v) =>
      parseUint("dir", v)
        .andThen((n) => oneOf("dir", [0, 1, 2] as const, n))
        .map(set("dir")),
  ],
  [
    "wrap",
    (v) =>
      parseUint("wrap", v)
        .andThen((n) => oneOf("wrap", [0, 1, 2] as const, n))
        .map(set("wrap")),
  ],
  ["ellipsize", (v) => parseBool("ellipsize", v).map(set("ellipsize"))],
  ["justify", (v) => parseBool("justify", v).map(set("justify"))],
  ["strike", (v) => parseBool("strike", v).map(set("strike"))],
]);

const applyTextKey = (o: TextOverlay, { key, value }: Token): Result<TextOverlay, ParamError> => {
  if (key === "font") return FontSpec.parse(value).map((f) => ({ ...o, fonts: [...o.fonts, f] }));
  return safeDecode(value).andThen((v) => {
    const transform = TEXT_TRANSFORM_KEYS.has(key) ? transformHandlers.get(key) : undefined;
    const handler =
      textHandlers.get(key) ?? overlayHandler<TextOverlay>(key) ?? (transform && liftTransform<TextOverlay>(transform));
    return handler
      ? handler(v).map((update) => update(o))
      : fail({ kind: "OverlayParameterNotAllowed", overlay: "Text", key });
  });
};

const parseTextOverlay = (inner: string): Result<TextOverlay, ParamError> => {
  // text= is the last parameter and its value runs up to `)`. %2c is not treated as a separator either.
  const m = /(^|,|%2[cC])text=/.exec(inner);
  if (!m) return fail({ kind: "TextRequired" });
  return safeDecode(inner.slice(m.index + m[0].length)).andThen((text) => {
    const initial: TextOverlay = {
      kind: "Text",
      text,
      fonts: [],
      color: Rgba.black,
      background: Rgba.transparentWhite,
      linespacing: 0,
      align: 0,
      dir: 0,
      wrap: 0,
      ellipsize: false,
      justify: false,
      strike: false,
      transform: Transform.default,
      position: Position.default,
    };
    return tokenize(inner.slice(0, m.index)).andThen((tokens) => fold(tokens, initial, applyTextKey));
  });
};

// ---- Top level ----

/** Legacy-style overlays (l=%2fpath). Positions (lx/ly/lxr/lyr/lg) are shared across all of them regardless of order. */
type LegacyOverlay = Readonly<{ kind: "Legacy"; path: string }>;

type Draft = Readonly<{
  params: Params;
  overlays: readonly (Overlay | LegacyOverlay)[];
  legacyPosition: Position;
}>;

const outputHandlers: Handlers<Params> = new Map<string, Handler<Params>>([
  ["f", (v) => OutputFormat.parseList(v).map(set("f"))],
  ["q", (v) => parseUint("q", v, 0, 100).map((q) => set<Params, "q">("q")(q === 0 ? 75 : q))],
  ["o", (v) => parseBool("o", v).map(set("o"))],
  ["lossless", (v) => parseBool("lossless", v).map(set("lossless"))],
  [
    "s",
    (v) =>
      parseUint("s", v)
        .andThen((n) => oneOf("s", [1, 2] as const, n))
        .map(set("s")),
  ],
  ["through", (v) => ThroughFormat.parseList(v).map(set("through"))],
  ["expires", (v) => parseExpires(v).map(set("expires"))],
  ["anim", (v) => parseBool("anim", v).map(set("anim"))],
  ["sig", () => ok((p) => p)],
]);

/** Legacy position key → Position key */
const LEGACY_POSITION_KEYS: ReadonlyMap<string, string> = new Map([
  ["lx", "x"],
  ["ly", "y"],
  ["lxr", "xr"],
  ["lyr", "yr"],
  ["lg", "lg"],
]);

const draftHandler = (key: string): Handler<Draft> | undefined => {
  const transform = transformHandlers.get(key);
  if (transform) {
    return lift<Transform, Draft>(
      transform,
      (d) => d.params.transform,
      (d, t) => ({ ...d, params: { ...d.params, transform: t } }),
    );
  }
  const output = outputHandlers.get(key);
  if (output)
    return lift<Params, Draft>(
      output,
      (d) => d.params,
      (d, p) => ({ ...d, params: p }),
    );
  const legacy = positionHandlers.get(LEGACY_POSITION_KEYS.get(key) ?? "");
  if (legacy) {
    return lift<Position, Draft>(
      legacy,
      (d) => d.legacyPosition,
      (d, p) => ({ ...d, legacyPosition: p }),
    );
  }
  return undefined;
};

const addOverlay = (d: Draft, o: Overlay | LegacyOverlay): Draft => ({ ...d, overlays: [...d.overlays, o] });

const applyToken = (draft: Draft, token: Token): Result<Draft, ParamError> => {
  const { key, value } = token;
  const d: Draft = key === "sig" ? draft : { ...draft, params: { ...draft.params, keys: [...draft.params.keys, key] } };
  if (key === "l") {
    return unwrapParens(value).andThen((inner) =>
      inner === undefined
        ? safeDecode(value).map((path) => addOverlay(d, { kind: "Legacy", path }))
        : parseImageOverlay(inner).map((o) => addOverlay(d, o)),
    );
  }
  if (key === "t") {
    return unwrapParens(value).andThen((inner) =>
      inner === undefined
        ? fail({ kind: "TextNotParenthesized" })
        : parseTextOverlay(inner).map((o) => addOverlay(d, o)),
    );
  }
  const handler = draftHandler(key);
  if (!handler) return fail({ kind: "UnexpectedParameter", key });
  return safeDecode(value)
    .andThen(handler)
    .map((update) => update(d));
};

const finalize = ({ params, overlays, legacyPosition }: Draft): Params => ({
  ...params,
  overlays: overlays.map((o): Overlay =>
    o.kind === "Legacy" ? { kind: "Image", path: o.path, transform: Transform.default, position: legacyPosition } : o,
  ),
});

export const ParseParams = {
  /**
   * Parses a parameter string. If base is given, URL parameters are layered on top of it (for path parameters).
   * keys contains only the keys that appeared in raw.
   */
  parse: (raw: string, base: Params = Params.default): Result<Params, ParamError> =>
    tokenize(raw)
      .andThen((tokens) =>
        fold<Draft>(
          tokens,
          { params: { ...base, keys: [] }, overlays: base.overlays, legacyPosition: Position.default },
          applyToken,
        ),
      )
      .map(finalize),
} as const;
