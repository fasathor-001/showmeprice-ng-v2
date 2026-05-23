import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  encryptAccountNumber,
  decryptAccountNumber,
  maskAccountNumber,
  __resetKeyCacheForTest,
} from "@/lib/crypto/payment-details";

// D-120 / Commit 1.6 — pure vitest coverage for the Web Crypto helpers.
// DB/RLS integration is verified by the smoke harness (Finding F).
//
// 32-byte (256-bit) Base64 key — generated once for these tests, NOT a
// production key. Real key generation: `openssl rand -base64 32`.
const VALID_KEY_B64 = "lvqGFV9d7gXAYJjg69IzhMfBKMPALe6Fg7K2VqyyzBg=";

const ENV_VAR = "PAYMENT_DETAILS_ENCRYPTION_KEY";
const originalKey = process.env[ENV_VAR];

function setKey(value: string | undefined) {
  if (value === undefined) {
    delete process.env[ENV_VAR];
  } else {
    process.env[ENV_VAR] = value;
  }
  __resetKeyCacheForTest();
}

beforeEach(() => {
  setKey(VALID_KEY_B64);
});

afterAll(() => {
  setKey(originalKey);
});

describe("encryptAccountNumber / decryptAccountNumber — round-trip", () => {
  it("decrypts back to the exact plaintext (10-digit NUBAN)", async () => {
    const plain = "0123456789";
    const ct = await encryptAccountNumber(plain);
    const out = await decryptAccountNumber(ct);
    expect(out).toBe(plain);
  });

  it("produces a different ciphertext each call (IV is fresh per encrypt)", async () => {
    const plain = "0123456789";
    const a = await encryptAccountNumber(plain);
    const b = await encryptAccountNumber(plain);
    expect(a).not.toBe(b);
    // Both should still decrypt back to the same plaintext.
    expect(await decryptAccountNumber(a)).toBe(plain);
    expect(await decryptAccountNumber(b)).toBe(plain);
  });

  it("rejects a tampered ciphertext (AES-GCM auth tag mismatch)", async () => {
    const ct = await encryptAccountNumber("0123456789");
    // Flip the last character to break the tag.
    const tampered =
      ct.slice(0, -2) + (ct.endsWith("A=") ? "B=" : "A=");
    await expect(decryptAccountNumber(tampered)).rejects.toThrow();
  });
});

describe("encryptAccountNumber — key handling", () => {
  it("throws with the env-var name when the key is missing", async () => {
    setKey(undefined);
    await expect(encryptAccountNumber("0123456789")).rejects.toThrow(
      /PAYMENT_DETAILS_ENCRYPTION_KEY/,
    );
  });

  it("throws when the key is not valid Base64", async () => {
    setKey("!!!not-base64!!!");
    await expect(encryptAccountNumber("0123456789")).rejects.toThrow(
      /Base64|invalid/i,
    );
  });

  it("throws when the key decodes to the wrong length (not 32 bytes)", async () => {
    // 16 random bytes → wrong length for AES-256.
    const shortKey = "AAECAwQFBgcICQoLDA0ODw==";
    setKey(shortKey);
    await expect(encryptAccountNumber("0123456789")).rejects.toThrow(
      /32|AES-256/,
    );
  });
});

describe("maskAccountNumber", () => {
  it("returns **** + last 4 for a normal 10-digit account", () => {
    expect(maskAccountNumber("0123456789")).toBe("****6789");
  });

  it("returns **** for very short inputs", () => {
    expect(maskAccountNumber("")).toBe("****");
    expect(maskAccountNumber("12")).toBe("****");
    expect(maskAccountNumber("1234")).toBe("****");
  });
});
