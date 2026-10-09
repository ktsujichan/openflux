/**
 * Position of a region of size inner placed within outer relative to the gravity origin.
 * The offset is reversed when the origin is on the right (bottom) side, and is the distance from center when centered.
 */
export const anchor = (outer: number, inner: number, offset: number, factor: number): number => {
  if (factor === 0) return offset;
  if (factor === 1) return outer - inner - offset;
  return Math.floor((outer - inner) / 2) + offset;
};
