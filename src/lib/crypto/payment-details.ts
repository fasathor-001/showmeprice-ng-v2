// D-120 payment-details encryption. AES-256-GCM via Web Crypto API.
//
// WHY Web Crypto and not Node `crypto`: server actions run on Cloudflare
// Pages Edge runtime (D-019, D-024). The V8 isolate environment does not
// provide Node built-ins. Web Crypto's SubtleCrypto is available in every
// runtime (browser / Node 16+ / Cloudflare Workers / Pages Functions /
// Deno) so the same implementation works for vitest and production.
//
// FORMAT: the stored ciphertext is Base64(IV(12 bytes) || ciphertext || tag(16 bytes)).
// IV is a fresh 96-bit value per encryption — never reused for the same key.
// The auth tag is appended to the ciphertext by Web Crypto (16 bytes at the
// end); decrypt reverses by handing back IV + (CT || tag).
//
// KEY: PAYMENT_DETAILS_ENCRYPTION_KEY env var, Base64-encoded 32 bytes
// (AES-256). Generated via `openssl rand -base64 32`. Throw-on-first-use
// (NOT on module load) so a missing-key environment doesn't break unrelated
// server start. Key is cached after first successful import — Edge requests
// reuse the same CryptoKey object across invocations within the same isolate.
//
// SAFETY: maskAccountNumber() returns "****" + last-4 for any debug-log
// surface; never log plaintext. Encryption errors throw with a generic
// message — the underlying Web Crypto exception is logged via console.error.

const ENV_VAR = "PAYMENT_DETAILS_ENCRYPTION_KEY";
const ALG = { name: "AES-GCM" } as const;
const IV_BYTES = 12; // 96-bit IV is the AES-GCM recommendation.

let cachedKey: Promise<CryptoKey> | null = null;

/**
 * Resolve the AES-256-GCM CryptoKey. Throws if the env var is missing or
 * malformed. Cached after first success so repeated calls in the same isolate
 * are free.
 */
async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const raw = process.env[ENV_VAR];
  if (!raw || raw.length === 0) {
    throw new Error(
      `Encryption key missing: set the ${ENV_VAR} env var to a Base64-encoded 32-byte value (generate with 'openssl rand -base64 32').`,
    );
  }
  cachedKey = (async () => {
    let bytes: Uint8Array;
    try {
      bytes = base64Decode(raw);
    } catch {
      throw new Error(
        `Encryption key invalid: ${ENV_VAR} must be valid Base64.`,
      );
    }
    if (bytes.byteLength !== 32) {
      throw new Error(
        `Encryption key invalid: ${ENV_VAR} decoded to ${bytes.byteLength} bytes; expected 32 (AES-256).`,
      );
    }
    return crypto.subtle.importKey(
      "raw",
      bytes as BufferSource,
      ALG,
      false,
      ["encrypt", "decrypt"],
    );
  })();
  return cachedKey;
}

/** TEST-ONLY: drop the cached key. Exported for vitest to reset between tests. */
export function __resetKeyCacheForTest(): void {
  cachedKey = null;
}

/**
 * Encrypt a UTF-8 plaintext (e.g. an account number). Returns Base64(IV || CT || tag).
 * Throws on missing/invalid key.
 */
export async function encryptAccountNumber(plaintext: string): Promise<string> {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptAccountNumber: plaintext must be a non-empty string");
  }
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { ...ALG, iv: iv as BufferSource },
      key,
      new TextEncoder().encode(plaintext) as BufferSource,
    ),
  );
  const packed = new Uint8Array(iv.byteLength + ct.byteLength);
  packed.set(iv, 0);
  packed.set(ct, iv.byteLength);
  return base64Encode(packed);
}

/**
 * Decrypt a Base64(IV || CT || tag) string back to plaintext. Throws on
 * malformed input or auth-tag mismatch (tamper detection).
 */
export async function decryptAccountNumber(ciphertext: string): Promise<string> {
  if (typeof ciphertext !== "string" || ciphertext.length === 0) {
    throw new Error("decryptAccountNumber: ciphertext must be a non-empty string");
  }
  let packed: Uint8Array;
  try {
    packed = base64Decode(ciphertext);
  } catch {
    throw new Error("decryptAccountNumber: invalid Base64");
  }
  // Minimum: 12 (IV) + 16 (tag) + 1 (plaintext) = 29 bytes. Defensive lower bound.
  if (packed.byteLength < IV_BYTES + 16 + 1) {
    throw new Error("decryptAccountNumber: ciphertext too short");
  }
  const iv = packed.subarray(0, IV_BYTES);
  const ctWithTag = packed.subarray(IV_BYTES);
  const key = await getKey();
  const pt = await crypto.subtle.decrypt(
    { ...ALG, iv: iv as BufferSource },
    key,
    ctWithTag as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

/**
 * Mask a (typically decrypted) account number for safe display in logs.
 * Returns "****" + last 4 digits. For very short inputs returns "****".
 */
export function maskAccountNumber(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) return "****";
  if (plaintext.length <= 4) return "****";
  return "****" + plaintext.slice(-4);
}

// --- Base64 helpers (no Node dependency; work in Edge + browsers) ---------

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function base64Decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
