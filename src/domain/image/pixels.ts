/**
 * RGBA 8bit pixel data.
 * Copying multi-MB pixel buffers for every filter or mask would cost a lot of memory and CPU time,
 * so functions taking this type (filters / mask-compositing) exceptionally mutate data in place.
 */
export type Pixels = Readonly<{ data: Uint8ClampedArray; width: number; height: number }>;
