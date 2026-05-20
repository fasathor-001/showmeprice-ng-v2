// Vendor-agnostic OTP delivery interface (Stage 2.A).
//
// App code never imports a concrete provider directly. Use getOtpProvider()
// from ./index to receive the configured implementation; tests inject a mock
// satisfying this interface.
//
// The interface is intentionally minimal — "deliver this rendered message to
// this number" — so swapping providers (Termii <-> Arkesel <-> Twilio <-> ...)
// is a config change, never an interface change. We own everything else.

import type { SendOtpRequest, SendOtpResult } from "./types";

export interface OtpProvider {
  /** Vendor identifier — 'termii' | 'arkesel'. Used for logging / routing. */
  readonly vendor: string;

  /**
   * Deliver a pre-rendered OTP message to a canonical NG number.
   *
   * @throws NotImplementedError       — channel unsupported by this provider
   * @throws OtpRateLimitedError       — vendor API throttled (429-equivalent)
   * @throws OtpDeliveryError          — vendor rejected the send
   * @throws OtpProviderUnreachableError — transport/network failure
   */
  sendOtp(request: SendOtpRequest): Promise<SendOtpResult>;
}
