// Identity verification module — public surface.
//
// App code imports `getNinVerifier()` from this file to receive the
// configured implementation. Tests inject a mock satisfying the
// NinVerifier interface; production reads the vendor from
// NIN_VERIFIER_VENDOR env var (default: 'korapay').
//
// D-077 fallback: if Korapay Identity approval is delayed past Stage 2,
// app code that needs NIN verification will catch NotImplementedError
// and surface the manual seller verification (Phase C.5) flow instead.

import { NinVerifier } from "./nin-verifier";
import { KorapayNinVerifier } from "./korapay-nin-verifier";

export * from "./types";
export * from "./errors";
export type { NinVerifier } from "./nin-verifier";
export { KorapayNinVerifier } from "./korapay-nin-verifier";

type SupportedVendor = "korapay";

function readVendor(): SupportedVendor {
  const raw = process.env.NIN_VERIFIER_VENDOR?.toLowerCase() ?? "korapay";
  if (raw === "korapay") return raw;
  throw new Error(
    `Invalid NIN_VERIFIER_VENDOR='${raw}' — only 'korapay' is supported in Phase E (D-074). Dojah deprioritized per D-074.`,
  );
}

function readRequired(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

let _instance: NinVerifier | null = null;

/**
 * Returns the configured NinVerifier implementation.
 *
 * Phase E: returns a KorapayNinVerifier whose verifyNin() throws
 * NotImplementedError until Stage 2 lands (gated on Korapay Identity
 * approval per D-077). Callers should catch NotImplementedError and
 * fall back to the manual seller-verification flow.
 *
 * Instance is memoized per process — verifier is stateless beyond config.
 */
export function getNinVerifier(): NinVerifier {
  if (_instance) return _instance;

  const vendor = readVendor();

  if (vendor === "korapay") {
    _instance = new KorapayNinVerifier({
      secretKey: readRequired("KORAPAY_SECRET_KEY"),
      apiBaseUrl: process.env.KORAPAY_API_BASE_URL,
    });
  }

  if (!_instance) {
    throw new Error(`Unreachable: vendor '${vendor}' fell through factory`);
  }
  return _instance;
}

/**
 * Test-only: reset the memoized instance so a subsequent getNinVerifier()
 * picks up new env vars. Do NOT call from production code paths.
 */
export function __resetNinVerifierInstance(): void {
  _instance = null;
}
