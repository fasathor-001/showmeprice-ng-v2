// SHA-256 hex digest via the Web Crypto API (crypto.subtle).
//
// Edge-native: works in the Cloudflare Pages / Workers runtime and Node 20.
// node:crypto is NOT available on edge, so this is the only portable option.
//
// Used for both OTP code hashing (salt:phone:code) and request-IP hashing
// (salt:rawIp). The salt is OTP_HASH_SALT — a stable, never-rotated app secret.

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
