// KorapayNinVerifier — Phase E primary NIN verifier (D-074).
//
// Stage 2 will fill in the actual Korapay Identity API integration once
// Live Mode KYC + Identity service approval lands (timeline per D-077).
// The Stage 2 commit also finalizes `kyc_documents` column shape based
// on the actual Korapay response envelope (D-075 schema deferral).
//
// E.1.7 ships the class skeleton + constructor wiring so app code can
// import getNinVerifier() today; verifyNin throws NotImplementedError
// until Stage 2 lands. Tests should mock the NinVerifier interface.

import type { NinVerifier } from "./nin-verifier";
import type { VerifyNinParams, VerifyNinResult } from "./types";
import { NotImplementedError } from "./errors";

export interface KorapayNinVerifierConfig {
  secretKey: string;
  /** Override for the API base URL — defaults to Korapay Identity prod. */
  apiBaseUrl?: string;
}

export class KorapayNinVerifier implements NinVerifier {
  public readonly vendor = "korapay";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly _config: KorapayNinVerifierConfig) {
    // Config validation deferred to Stage 2.
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  verifyNin(_params: VerifyNinParams): Promise<VerifyNinResult> {
    throw new NotImplementedError("KorapayNinVerifier.verifyNin");
  }
}
