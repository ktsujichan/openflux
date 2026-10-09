/** Errors are returned as text/plain with no-store. */
export const textResponse = (status: number, message: string, contentType = "text/plain; charset=utf-8"): Response =>
  new Response(message, { status, headers: { "Content-Type": contentType, "Cache-Control": "no-store" } });
