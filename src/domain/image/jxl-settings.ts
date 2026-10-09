/** JPEG XL encoding settings. */
export type JxlSettings = Readonly<{
  /** libjxl effort (1-9). Higher means better compression and slower. */
  effort: number;
  /** JPEG XL output with more pixels than this is rejected (to bound CPU time). */
  maxPixels: number;
}>;
