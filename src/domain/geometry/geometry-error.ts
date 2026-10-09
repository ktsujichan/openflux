/** Failures in dimension calculations. All are treated as 400 Bad Request. */
export type GeometryError = Readonly<{ kind: "OutputTooLarge"; max: number }> | Readonly<{ kind: "ClipOutOfImage" }>;
