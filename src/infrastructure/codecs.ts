/**
 * WebAssembly codecs for what Cloudflare Images cannot do (JPEG XL encode/decode, PNG I/O for per-pixel
 * processing). Each is initialized only on first use.
 */
import jxlDecFactory from "@jsquash/jxl/codec/dec/jxl_dec.js";
import jxlDecWasm from "@jsquash/jxl/codec/dec/jxl_dec.wasm?module";
import jxlEncFactory from "@jsquash/jxl/codec/enc/jxl_enc.js";
import jxlEncWasm from "@jsquash/jxl/codec/enc/jxl_enc.wasm?module";
import initPng, { decode as pngDecodeRaw, encode as pngEncodeRaw } from "@jsquash/png/codec/pkg/squoosh_png.js";
import pngWasm from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm?module";

import type { Pixels } from "../domain/image/pixels";

/** Synchronously instantiates an Emscripten module from a bundled WebAssembly.Module. */
type EmscriptenFactory<T> = (overrides: {
  noInitialRun: boolean;
  instantiateWasm: (
    imports: WebAssembly.Imports,
    callback: (instance: WebAssembly.Instance) => void,
  ) => WebAssembly.Exports;
}) => Promise<T>;

const instantiate = <T>(factory: EmscriptenFactory<T>, wasm: WebAssembly.Module): Promise<T> =>
  factory({
    noInitialRun: true,
    instantiateWasm: (imports, callback) => {
      const instance = new WebAssembly.Instance(wasm, imports);
      callback(instance);
      return instance.exports;
    },
  });

// Initialized modules (reused within the Worker instance)
let png: ReturnType<typeof initPng> | undefined;
let jxlEnc: ReturnType<typeof jxlEncFactory> | undefined;
let jxlDec: ReturnType<typeof jxlDecFactory> | undefined;

export type JxlOptions = Readonly<{ quality: number; effort: number; lossless: boolean }>;

export const Codecs = {
  decodePng: async (bytes: Uint8Array): Promise<Pixels> => {
    await (png ??= initPng(pngWasm));
    const img = pngDecodeRaw(bytes);
    return { data: img.data, width: img.width, height: img.height };
  },

  encodePng: async (px: Pixels): Promise<Uint8Array> => {
    await (png ??= initPng(pngWasm));
    return pngEncodeRaw(new Uint8Array(px.data.buffer, px.data.byteOffset, px.data.byteLength), px.width, px.height, 8);
  },

  encodeJxl: async (px: Pixels, o: JxlOptions): Promise<Uint8Array> => {
    const mod = await (jxlEnc ??= instantiate(jxlEncFactory, jxlEncWasm));
    const out = mod.encode(px.data, px.width, px.height, {
      effort: o.effort,
      quality: o.lossless ? 100 : o.quality,
      progressive: false,
      epf: -1,
      lossyPalette: false,
      decodingSpeedTier: 0,
      photonNoiseIso: 0,
      lossyModular: false,
      lossless: o.lossless,
    });
    if (!out) throw new Error("JPEG XL encoding failed");
    return out.slice();
  },

  decodeJxl: async (bytes: Uint8Array): Promise<Pixels> => {
    const mod = await (jxlDec ??= instantiate(jxlDecFactory, jxlDecWasm));
    const img = mod.decode(bytes);
    if (!img) throw new Error("JPEG XL decoding failed");
    return { data: img.data, width: img.width, height: img.height };
  },
} as const;
