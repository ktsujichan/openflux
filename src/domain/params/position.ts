import { Gravity } from "./gravity";

/** Overlay position. xr/yr take precedence over x/y when specified. */
export type Position = Readonly<{ x: number; y: number; xr?: number; yr?: number; lg: Gravity }>;

export const Position = {
  default: { x: 0, y: 0, lg: Gravity.center } as const satisfies Position,
} as const;
