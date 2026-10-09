/** Solid-color PNG (used as the canvas for padding and text backgrounds). CRC32 / Adler-32 are written as imperative loops. */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: number[]): number[] {
  const body = new Uint8Array([...new TextEncoder().encode(type), ...data]);
  const len = data.length;
  const crc = crc32(body);
  return [
    len >>> 24,
    (len >>> 16) & 255,
    (len >>> 8) & 255,
    len & 255,
    ...body,
    crc >>> 24,
    (crc >>> 16) & 255,
    (crc >>> 8) & 255,
    crc & 255,
  ];
}

/** 1x1 RGBA PNG. Stretched to any size by Cloudflare Images and used as a solid-color canvas. */
export function solidPng(r: number, g: number, b: number, a: number): Uint8Array {
  const raw = [0, r, g, b, a]; // filter type 0 + 1 pixel
  let s1 = 1;
  let s2 = 0;
  for (const v of raw) {
    s1 = (s1 + v) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  // zlib header + stored (uncompressed) block + Adler-32
  const zlib = [0x78, 0x01, 0x01, 5, 0, 0xfa, 0xff, ...raw, s2 >>> 8, s2 & 255, s1 >>> 8, s1 & 255];
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    ...chunk("IDAT", zlib),
    ...chunk("IEND", []),
  ]);
}
