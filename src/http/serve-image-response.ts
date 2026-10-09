import type { ServeImageError } from "../application/serve-image-error";
import { ParamError } from "../domain/params/param-error";
import { assertNever } from "../domain/shared/assert-never";
import { textResponse } from "./text-response";

export const ServeImageResponse = {
  /** Turns a workflow failure into a response with a status and message. */
  error: (e: ServeImageError): Response => {
    switch (e.kind) {
      case "UnexpectedParameter":
      case "MalformedParameter":
      case "InvalidValue":
      case "OutOfRange":
      case "InvalidColor":
      case "UnsupportedFormat":
      case "TimezoneNotUtc":
      case "DprNotPositive":
      case "DprTooLarge":
      case "UnbalancedParentheses":
      case "InvalidPercentEncoding":
      case "OverlayPathMissing":
      case "OverlayParameterNotAllowed":
      case "TextRequired":
      case "TextNotParenthesized":
      case "InvalidFontOption":
        return textResponse(400, ParamError.message(e));
      case "OutputTooLarge":
        return textResponse(400, `argument must be less than ${e.max}`);
      case "ClipOutOfImage":
        return textResponse(400, "clipping area is out of the image");
      case "UnknownHost":
        return textResponse(404, "unknown host");
      case "IpForbidden":
        return textResponse(403, "forbidden");
      case "SignatureRequired":
        return textResponse(403, "signature is required");
      case "SignatureInvalid":
        return textResponse(403, "invalid signature");
      case "Expired":
        return textResponse(403, "already expired");
      case "ParameterOverrideForbidden":
        return textResponse(400, "overriding parameters is not allowed");
      case "ParameterNotAllowed":
        return textResponse(400, `parameter ${e.key} is not allowed`);
      case "OriginRejected":
        return textResponse(e.status, e.body, e.contentType ?? "text/plain");
      case "UnsupportedInput":
        return textResponse(400, "input image format is not JPEG, PNG nor GIF");
      case "UnsupportedFeature":
        return textResponse(400, `unsupported parameter: ${e.feature}`);
      case "JxlTooLarge":
        return textResponse(400, "image is too large for JPEG XL output");
      default:
        return assertNever(e);
    }
  },
} as const;
