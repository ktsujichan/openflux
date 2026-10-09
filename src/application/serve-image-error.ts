import type { AccessError } from "../domain/access/access-error";
import type { RenderError } from "../domain/image/render-error";
import type { UnsupportedFeature } from "../domain/image/unsupported-feature";
import type { UnsupportedInput } from "../domain/image/unsupported-input";
import type { ParamError } from "../domain/params/param-error";

/** Failures in the image delivery workflow that are returned as HTTP responses. */
export type ServeImageError = AccessError | ParamError | RenderError | UnsupportedFeature | UnsupportedInput;
