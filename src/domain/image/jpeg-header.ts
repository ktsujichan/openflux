/**
 * Reads the JPEG Exif Orientation and the (pre-rotation) pixel dimensions recorded in SOF.
 * It is a binary parser that walks markers in order, so it is written as imperative loops.
 */

export type JpegHeader = Readonly<{
  orientation: number;
  width: number;
  height: number;
}>;

const read = (b: Uint8Array): JpegHeader | undefined => {
  if (b[0] !== 0xff || b[1] !== 0xd8) return undefined;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let orientation = 1;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return undefined;
    const marker = b[i + 1] ?? 0;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = view.getUint16(i + 2);
    if (marker === 0xe1 && len >= 8) {
      orientation = readOrientation(view, i + 4, len - 2) ?? orientation;
    }
    // SOF0..SOF15 (except DHT=C4, JPG=C8, DAC=CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > b.length) return undefined;
      return { orientation, height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
    }
    i += 2 + len;
  }
  return undefined;
};

const readOrientation = (view: DataView, start: number, length: number): number | undefined => {
  const end = start + length;
  if (end > view.byteLength) return undefined;
  // "Exif\0\0"
  if (view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0) return undefined;
  const tiff = start + 6;
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return undefined;
  const count = u16(ifd);
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > end) return undefined;
    if (u16(entry) === 0x0112) {
      const v = u16(entry + 8);
      return v >= 1 && v <= 8 ? v : undefined;
    }
  }
  return undefined;
};

export const JpegHeader = { read } as const;
