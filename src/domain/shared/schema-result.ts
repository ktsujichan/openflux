import type { StandardSchemaV1 } from "@standard-schema/spec";
import { type Result, err, ok } from "neverthrow";

export type ValidationError = Readonly<{
  kind: "ValidationError";
  issues: ReadonlyArray<StandardSchemaV1.Issue>;
}>;

export const ValidationError = {
  /** Formats issues as a single line for logs and error responses. */
  describe: (e: ValidationError): string =>
    e.issues
      .map((i) => {
        const path = (i.path ?? []).map((p) => (typeof p === "object" ? String(p.key) : String(p))).join(".");
        return path ? `${path}: ${i.message}` : i.message;
      })
      .join("; "),
} as const;

/** Creates a parse function returning a Result from a Standard Schema compliant schema. */
export const schemaResult =
  <T>(schema: StandardSchemaV1<unknown, T>) =>
  (raw: unknown): Result<T, ValidationError> => {
    const result = schema["~standard"].validate(raw);
    if (result instanceof Promise) throw new TypeError("Schema validation must be synchronous");
    if (result.issues) return err({ kind: "ValidationError", issues: result.issues });
    return ok(result.value);
  };
