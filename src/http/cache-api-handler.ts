/**
 * Routing and request body parsing for the cache API.
 *   POST /api/cache.lookup  token=...&url=...  → {"ok": true, "urls": [...]}
 *   POST /api/cache.delete  token=...&url=...  → {"ok": true, "urls": [...]}
 */
import type { Result } from "neverthrow";

import type { CacheApiError } from "../application/cache-api-error";
import type { CacheKey } from "../domain/delivery/cache-key";
import { assertNever } from "../domain/shared/assert-never";
import { ValidationError } from "../domain/shared/schema-result";

export type CacheApiMethod = "cache.lookup" | "cache.delete";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const errorResponse = (e: CacheApiError): Response => {
  switch (e.kind) {
    case "InvalidAuth":
      return json({ ok: false, error: "invalid_auth" }, 401);
    case "ValidationError":
      return json({ ok: false, error: "invalid_request", detail: ValidationError.describe(e) }, 400);
    case "PurgeFailed":
      return json({ ok: false, error: "purge_failed", detail: `${e.status} ${e.detail}` }, 502);
    default:
      return assertNever(e);
  }
};

const stringEntries = (entries: Iterable<[string, unknown]>): Record<string, string> =>
  Object.fromEntries([...entries].flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));

export const CacheApiHandler = {
  /** Extracts the API method name from the path. undefined for unrelated paths. */
  method: (pathname: string): CacheApiMethod | undefined =>
    (["cache.lookup", "cache.delete"] as const).find((m) => pathname === `/api/${m}`),

  /** Flattens query string, form and JSON parameters into an object (body takes precedence). Values are validated in the workflow. */
  readParams: async (request: Request): Promise<Record<string, string>> => {
    const query = stringEntries(new URL(request.url).searchParams.entries());
    const type = request.headers.get("Content-Type") ?? "";
    if (type.includes("application/json")) {
      const body: unknown = await request.json().catch(() => ({}));
      return { ...query, ...(typeof body === "object" && body !== null ? stringEntries(Object.entries(body)) : {}) };
    }
    if (type.includes("form")) {
      const form = await request.formData().catch(() => undefined);
      return { ...query, ...(form ? stringEntries(form.entries()) : {}) };
    }
    return query;
  },

  respond: (result: Result<readonly CacheKey[], CacheApiError>): Response =>
    result.match((urls) => json({ ok: true, urls }), errorResponse),

  unknownMethod: (): Response => json({ ok: false, error: "unknown_method" }, 404),
  methodNotAllowed: (): Response => json({ ok: false, error: "method_not_allowed" }, 405),
} as const;
