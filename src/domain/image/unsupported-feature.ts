/** An unsupported feature was requested (400 when strict is set). */
export type UnsupportedFeature = Readonly<{ kind: "UnsupportedFeature"; feature: string }>;
