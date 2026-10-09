import { type Result, err, ok } from "neverthrow";

import type { Overlay, TextOverlay } from "../params/overlay";
import type { Params } from "../params/params";
import { type FontCatalog, FontResolution } from "./font-resolution";
import type { UnsupportedFeature } from "./unsupported-feature";

/**
 * Result of identifying, before transforming, which requested features cannot be supported.
 * fonts is in the same order as the overlays: the font URL for each text overlay (undefined if not drawn).
 */
export type SupportAssessment = Readonly<{ ignored: readonly string[]; fonts: readonly (string | undefined)[] }>;

type OverlayAssessment = Readonly<{ font: string | undefined; issues: readonly string[] }>;

const textIssues = (o: TextOverlay): readonly string[] =>
  (
    [
      ["dir", o.dir !== 0],
      ["wrap", o.wrap !== 0],
      ["ellipsize", o.ellipsize],
      ["justify", o.justify],
    ] as const
  ).flatMap(([name, used]) => (used ? [`t.${name}`] : []));

const assessOverlay = (catalog: FontCatalog, o: Overlay): OverlayAssessment => {
  if (o.kind === "Image") return { font: undefined, issues: [] };
  const choice = FontResolution.resolve(catalog, o);
  return choice.kind === "Resolved"
    ? { font: choice.url, issues: [...choice.ignored, ...textIssues(o)] }
    : { font: undefined, issues: [...choice.ignored, "t (no font configured)"] };
};

export const SupportAssessment = {
  /** In strict mode, errors on the first unsupported feature; otherwise returns the list of ignored features. */
  assess: (params: Params, catalog: FontCatalog, strict: boolean): Result<SupportAssessment, UnsupportedFeature> => {
    const overlays = params.overlays.map((o) => assessOverlay(catalog, o));
    const ignored = overlays.flatMap((o) => o.issues);
    const first = ignored[0];
    if (strict && first !== undefined) return err({ kind: "UnsupportedFeature", feature: first });
    return ok({ ignored, fonts: overlays.map((o) => o.font) });
  },
} as const;
