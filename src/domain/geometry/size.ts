export type Size = Readonly<{ width: number; height: number }>;

export const Size = {
  swap: (s: Size): Size => ({ width: s.height, height: s.width }),
  pixels: (s: Size): number => s.width * s.height,
  equals: (a: Size, b: Size): boolean => a.width === b.width && a.height === b.height,
} as const;
