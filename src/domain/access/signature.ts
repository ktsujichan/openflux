/**
 * URL signature: signature = "1." + BASE64URL(HMAC-SHA-256(secret, path))
 */

const base64url = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const sign = async (secret: string, path: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `1.${base64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(path)))}`;
};

export const Signature = {
  sign,
  timingSafeEqual,
  /** Padding (=) is optional (the Ruby sample outputs it with padding). */
  verify: async (secret: string, path: string, signature: string): Promise<boolean> =>
    timingSafeEqual(await sign(secret, path), signature.replace(/=+$/, "")),
} as const;
