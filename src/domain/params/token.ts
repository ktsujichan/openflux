import { Result, err, ok } from "neverthrow";

import type { ParamError } from "./param-error";

/** One `key=value` in a parameter string. start/end is its range [start, end) in the original string. */
export type Token = Readonly<{ key: string; value: string; start: number; end: number }>;

const OPEN = ["(", "%28"] as const;
const CLOSE = [")", "%29"] as const;

const matchAt = (raw: string, i: number, candidates: readonly string[]): number =>
  candidates.find((c) => raw.slice(i, i + c.length).toLowerCase() === c)?.length ?? 0;

/** Position and length of a separator `,` / `%2c` outside parentheses (depth 0). */
const separators = (raw: string): readonly (readonly [number, number])[] => {
  const found: (readonly [number, number])[] = [];
  let depth = 0;
  // This is a lexer scanning one character at a time, so an imperative loop is used here
  for (let i = 0; i < raw.length; i++) {
    const open = matchAt(raw, i, OPEN);
    const close = open ? 0 : matchAt(raw, i, CLOSE);
    if (open) {
      depth++;
      i += open - 1;
    } else if (close) {
      depth = Math.max(0, depth - 1);
      i += close - 1;
    } else if (depth === 0 && raw[i] === ",") {
      found.push([i, 1]);
    } else if (depth === 0 && raw.slice(i, i + 3).toLowerCase() === "%2c") {
      found.push([i, 3]);
      i += 2;
    }
  }
  return found;
};

/** Splits a parameter string on `,` (or `%2c`). Does not split inside parentheses (overlay values). */
export const tokenize = (raw: string): Result<readonly Token[], ParamError> => {
  if (raw === "") return ok([]);
  const seps = separators(raw);
  const ranges = [...seps, [raw.length, 0] as const].map(([at], i) => {
    const prev = seps[i - 1];
    const start = prev ? prev[0] + prev[1] : 0;
    return [start, at] as const;
  });
  return Result.combine(
    ranges.map(([start, end]): Result<Token, ParamError> => {
      const s = raw.slice(start, end);
      const eq = s.indexOf("=");
      return eq <= 0
        ? err({ kind: "MalformedParameter", char: s[0] ?? "," })
        : ok({ key: s.slice(0, eq), value: s.slice(eq + 1), start, end });
    }),
  );
};

/** Returns the inside of the value if it is wrapped in parentheses; otherwise undefined. */
export const unwrapParens = (value: string): Result<string | undefined, ParamError> => {
  const open = matchAt(value, 0, OPEN);
  if (!open) return ok(undefined);
  const close = CLOSE.find((c) => value.toLowerCase().endsWith(c));
  return close === undefined
    ? err({ kind: "UnbalancedParentheses", value })
    : ok(value.slice(open, value.length - close.length));
};

/** Position of the first `/` at depth 0 (`/` inside overlay values is ignored). -1 if not found. */
export const indexOfSlash = (s: string, from: number): number => {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === "/" && depth === 0) return i;
  }
  return -1;
};
