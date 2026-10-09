import { type Err, err } from "neverthrow";

import { assertNever } from "../shared/assert-never";

/** Failures in parsing transform parameters. All are treated as 400 Bad Request. */
export type ParamError =
  | Readonly<{ kind: "UnexpectedParameter"; key: string }>
  | Readonly<{ kind: "MalformedParameter"; char: string }>
  | Readonly<{ kind: "InvalidValue"; key: string; value: string }>
  | Readonly<{ kind: "OutOfRange"; key: string }>
  | Readonly<{ kind: "InvalidColor"; key: string; value: string }>
  | Readonly<{ kind: "UnsupportedFormat"; value: string }>
  | Readonly<{ kind: "TimezoneNotUtc"; value: string }>
  | Readonly<{ kind: "DprNotPositive" }>
  | Readonly<{ kind: "DprTooLarge" }>
  | Readonly<{ kind: "UnbalancedParentheses"; value: string }>
  | Readonly<{ kind: "InvalidPercentEncoding"; value: string }>
  | Readonly<{ kind: "OverlayPathMissing"; value: string }>
  | Readonly<{ kind: "OverlayParameterNotAllowed"; overlay: "Image" | "Text"; key: string }>
  | Readonly<{ kind: "TextRequired" }>
  | Readonly<{ kind: "TextNotParenthesized" }>
  | Readonly<{ kind: "InvalidFontOption"; key: string }>;

export const ParamError = {
  /** Creates an Err (so that the error's literal type is checked as ParamError). */
  fail: (e: ParamError): Err<never, ParamError> => err(e),

  /** Error message used in the response body. */
  message: (e: ParamError): string => {
    switch (e.kind) {
      case "UnexpectedParameter":
        return `unexpected char [${e.key[0] ?? ""}], expected a parameter`;
      case "MalformedParameter":
        return `unexpected char [${e.char}], expected a parameter`;
      case "InvalidValue":
        return `invalid value: ${e.key}=${e.value}`;
      case "OutOfRange":
        return "out of range value";
      case "InvalidColor":
        return `invalid background color: ${e.key}=${e.value}`;
      case "UnsupportedFormat":
        return `invalid or unsupported format: ${e.value}`;
      case "TimezoneNotUtc":
        return "timezone must be UTC";
      case "DprNotPositive":
        return "dpr value must be greater than 0";
      case "DprTooLarge":
        return "dpr value must be smaller than or equal to 5.0";
      case "UnbalancedParentheses":
        return `unbalanced parentheses: ${e.value}`;
      case "InvalidPercentEncoding":
        return `invalid percent-encoding: ${e.value}`;
      case "OverlayPathMissing":
        return `overlay image path is missing: ${e.value}`;
      case "OverlayParameterNotAllowed":
        return e.overlay === "Image"
          ? `parameter ${e.key} cannot be specified for overlay`
          : `parameter ${e.key} cannot be specified for text overlay`;
      case "TextRequired":
        return "text parameter is required";
      case "TextNotParenthesized":
        return "t parameter must be enclosed in parentheses";
      case "InvalidFontOption":
        return `invalid font option: ${e.key}`;
      default:
        return assertNever(e);
    }
  },
} as const;
