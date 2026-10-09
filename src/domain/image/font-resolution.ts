import { FontSpec } from "../params/font-spec";
import type { TextOverlay } from "../params/overlay";

/** Font file selected for a text overlay. ignored holds the specifications that could not be used. */
export type FontChoice =
  | Readonly<{ kind: "Resolved"; url: string; ignored: readonly string[] }>
  | Readonly<{ kind: "Unavailable"; ignored: readonly string[] }>;

export type FontCatalog = Readonly<{
  /** Font name (variable fonts: `name:instance` / `name:wght=700`) → font file URL */
  fonts: ReadonlyMap<string, string>;
  defaultFont?: string;
}>;

export const FontResolution = {
  /** For each font in order, tries a registered variable spec and then the name; falls back to the default font. */
  resolve: (catalog: FontCatalog, overlay: TextOverlay): FontChoice => {
    const candidates = overlay.fonts.map((f) => {
      const key = FontSpec.variationKey(f);
      const variant = key === undefined ? undefined : catalog.fonts.get(key);
      return {
        url: variant ?? catalog.fonts.get(f.name),
        missingVariation: key !== undefined && !variant ? key : undefined,
      };
    });
    const chosen = candidates.findIndex((c) => c.url !== undefined);
    const considered = chosen < 0 ? candidates : candidates.slice(0, chosen + 1);
    const ignored = considered.flatMap((c) => (c.missingVariation ? [`font-variation (${c.missingVariation})`] : []));
    const url =
      candidates[chosen]?.url ??
      (catalog.defaultFont === undefined ? undefined : catalog.fonts.get(catalog.defaultFont));
    return url === undefined ? { kind: "Unavailable", ignored } : { kind: "Resolved", url, ignored };
  },
} as const;
