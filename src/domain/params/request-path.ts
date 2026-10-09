import { type Result, ok } from "neverthrow";

import { ObjectPath } from "../source/object-path";
import type { ParamError } from "./param-error";
import { type Token, indexOfSlash, tokenize } from "./token";
import { safeDecode } from "./value-parsers";

/** Keys used to decide whether a segment is the parameter section. */
const KNOWN_KEYS: ReadonlySet<string> = new Set([
  "w",
  "h",
  "a",
  "b",
  "g",
  "u",
  "dpr",
  "ic",
  "icr",
  "ig",
  "oc",
  "c",
  "ocr",
  "cr",
  "og",
  "ir",
  "or",
  "r",
  "unsharp",
  "blur",
  "grayscale",
  "sepia",
  "brightness",
  "contrast",
  "invert",
  "l",
  "lx",
  "ly",
  "lxr",
  "lyr",
  "lg",
  "t",
  "f",
  "q",
  "o",
  "lossless",
  "s",
  "through",
  "expires",
  "sig",
  "anim",
]);

/** A request URL path split into its parts. */
export type RequestPath = Readonly<{
  /** The `/c` or `/c!` prefix. */
  prefix: "" | "/c" | "/c!";
  /** Raw parameter section (still percent-encoded). null if there is no parameter section. */
  rawParams: string | null;
  objectPath: ObjectPath;
  /** Path to sign, with sig removed. */
  signingPath: string;
  /** Value of sig in the URL. */
  signature?: string;
}>;

const looksLikeParams = (segment: string): boolean =>
  tokenize(segment).match(
    (tokens) => tokens[0] !== undefined && KNOWN_KEYS.has(tokens[0].key),
    () => false,
  );

/** Removes sig together with the separator right after it (or right before it if none). */
const removeToken = (raw: string, tokens: readonly Token[], index: number): string => {
  const token = tokens[index];
  if (!token) return raw;
  const next = tokens[index + 1];
  const prev = tokens[index - 1];
  const start = !next && prev ? prev.end : token.start;
  const end = next ? next.start : token.end;
  return raw.slice(0, start) + raw.slice(end);
};

const withParams = (
  prefix: RequestPath["prefix"],
  segment: string,
  objectPath: ObjectPath,
): Result<RequestPath, ParamError> =>
  tokenize(segment).andThen((tokens) => {
    const index = tokens.findIndex((t) => t.key === "sig");
    const sig = tokens[index];
    if (!sig) return ok({ prefix, rawParams: segment, objectPath, signingPath: `${prefix}/${segment}${objectPath}` });
    const remaining = removeToken(segment, tokens, index);
    return safeDecode(sig.value).map((signature) => ({
      prefix,
      rawParams: segment,
      objectPath,
      signingPath: remaining === "" ? objectPath : `${prefix}/${remaining}${objectPath}`,
      signature,
    }));
  });

const detectPrefix = (pathname: string): RequestPath["prefix"] => {
  const prefix = (["/c!", "/c"] as const).find((p) => pathname.startsWith(`${p}/`));
  if (!prefix) return "";
  // Treat it as a prefix only when `/c/` is followed by both a parameter section and a path
  return indexOfSlash(pathname, prefix.length + 1) > prefix.length + 1 ? prefix : "";
};

export const RequestPath = {
  parse: (pathname: string): Result<RequestPath, ParamError> => {
    const prefix = detectPrefix(pathname);
    const rest = pathname.slice(prefix.length);
    const slash = indexOfSlash(rest, 1);
    const segment = slash > 0 ? rest.slice(1, slash) : "";
    if (slash > 0 && (prefix !== "" || looksLikeParams(segment))) {
      return withParams(prefix, segment, ObjectPath.fromUrlPath(rest.slice(slash)));
    }
    return ok({ prefix: "", rawParams: null, objectPath: ObjectPath.fromUrlPath(pathname), signingPath: pathname });
  },
} as const;
