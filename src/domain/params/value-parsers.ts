/**
 * Parsers for parameter values. The URL parameter grammar is not structured data like JSON,
 * so boundary validation uses small parsers returning Result instead of a schema library.
 */
import { type Result, err, ok } from "neverthrow";

import type { ParamError } from "./param-error";

export const safeDecode = (s: string): Result<string, ParamError> => {
  try {
    return ok(decodeURIComponent(s));
  } catch {
    return err({ kind: "InvalidPercentEncoding", value: s });
  }
};

export const parseUint = (
  key: string,
  v: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): Result<number, ParamError> => {
  if (!/^\d+$/.test(v)) return err({ kind: "InvalidValue", key, value: v });
  const n = Number(v);
  return n < min || n > max ? err({ kind: "OutOfRange", key }) : ok(n);
};

export const parseInteger = (key: string, v: string): Result<number, ParamError> =>
  /^[+-]?\d+$/.test(v) ? ok(Number(v)) : err({ kind: "InvalidValue", key, value: v });

export const parseFloatValue = (key: string, v: string): Result<number, ParamError> =>
  /^[+-]?(\d+\.?\d*|\.\d+)$/.test(v) ? ok(Number(v)) : err({ kind: "InvalidValue", key, value: v });

export const parseBool = (key: string, v: string): Result<boolean, ParamError> => {
  if (v === "0" || v === "false") return ok(false);
  if (v === "1" || v === "true") return ok(true);
  return err({ kind: "InvalidValue", key, value: v });
};

/** Returns the matching value from the allowed list (uses find rather than includes to narrow the type). */
export const oneOf = <T extends string | number>(
  key: string,
  allowed: readonly T[],
  value: string | number,
): Result<T, ParamError> => {
  const found = allowed.find((a) => a === value);
  return found === undefined ? err({ kind: "OutOfRange", key }) : ok(found);
};
