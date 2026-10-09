import { type Result, err, ok } from "neverthrow";

import type { ParamError } from "./param-error";
import { tokenize, unwrapParens } from "./token";
import { parseFloatValue, safeDecode } from "./value-parsers";

/** The font parameter. Variable fonts have either instance (a named instance) or vars (variation axes). */
export type FontSpec = Readonly<{
  name: string;
  instance?: string;
  vars: readonly (readonly [string, number])[];
}>;

const parseOption = (spec: FontSpec, key: string, raw: string): Result<FontSpec, ParamError> =>
  safeDecode(raw).andThen((v): Result<FontSpec, ParamError> => {
    if (key === "instance") return ok({ ...spec, instance: v });
    if (key !== "var") return err({ kind: "InvalidFontOption", key });
    const [tag, num] = v.split(":");
    if (!tag || num === undefined) return err({ kind: "InvalidValue", key: "var", value: v });
    return parseFloatValue("var", num).map((n) => ({ ...spec, vars: [...spec.vars, [tag, n] as const] }));
  });

export const FontSpec = {
  /** `name`, `(name)`, `(name,instance=…)`, `(name,var=tag:value,…)` */
  parse: (raw: string): Result<FontSpec, ParamError> =>
    unwrapParens(raw).andThen((inner) => {
      if (inner === undefined) return safeDecode(raw).map((name) => ({ name, vars: [] }));
      return tokenize(`name=${inner}`).andThen(([first, ...rest]) =>
        safeDecode(first?.value ?? "").andThen((name) =>
          rest.reduce<Result<FontSpec, ParamError>>(
            (acc, t) => acc.andThen((spec) => parseOption(spec, t.key, t.value)),
            ok({ name, vars: [] }),
          ),
        ),
      );
    }),

  /** Key in the fonts setting (`name:instance` / `name:wght=700,wdth=100`). undefined if there is no variable spec. */
  variationKey: (f: FontSpec): string | undefined => {
    if (f.instance !== undefined) return `${f.name}:${f.instance}`;
    if (f.vars.length === 0) return undefined;
    const axes = f.vars.toSorted(([a], [b]) => (a < b ? -1 : 1)).map(([t, v]) => `${t}=${v}`);
    return `${f.name}:${axes.join(",")}`;
  },
} as const;
