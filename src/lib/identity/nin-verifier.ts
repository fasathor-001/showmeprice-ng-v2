// Vendor-agnostic NIN verifier interface (D-078).
//
// Phase E ships KorapayNinVerifier as the primary implementation (D-074);
// Dojah is the named fallback target per D-074 but no Dojah implementation
// in Phase E scope (sales-gated signup blocked self-serve evaluation).
//
// App code never imports a concrete verifier directly. Use
// `getNinVerifier()` from `./index` to receive the configured
// implementation; tests inject a mock satisfying this interface.

import type { VerifyNinParams, VerifyNinResult } from "./types";

export interface NinVerifier {
  /** Vendor identifier — 'korapay', 'dojah', etc. */
  readonly vendor: string;

  /**
   * Verify a NIN against the Nigerian NIMC database via the configured
   * vendor. Returns a normalized result with vendor_raw_response carrying
   * the full vendor envelope for audit / Stage 2 schema-design decisions
   * (per D-075).
   *
   * @throws InvalidNinError if the NIN format is invalid (not 11 digits)
   * @throws VerifierUnreachableError on transport failure
   * @throws VerifierRateLimitedError if the vendor rate-limited the call
   */
  verifyNin(params: VerifyNinParams): Promise<VerifyNinResult>;
}
