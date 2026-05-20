// Vendor-agnostic OTP delivery types + error taxonomy. Consumed by the
// OtpProvider interface and the server actions that send/verify phone OTPs.
//
// Stage 2.A ships Termii + Arkesel as DELIVERY-ONLY implementations: we own
// the OTP lifecycle (generation, hashing, expiry, attempts, rate limits) and
// the provider only delivers a pre-rendered message. Vendor-specific concepts
// (Termii pin_id, Arkesel OTP product) never enter this interface.

export type OtpChannel = "sms" | "whatsapp";

export interface SendOtpRequest {
  /** Canonical NG number, E.164 without '+' (e.g. 2348012345678). */
  to: string;
  /**
   * Fully-rendered message text including the OTP code. The provider delivers
   * it verbatim and never owns the copy or treats it as state — OTP rendering
   * lives in the server action so the wording exists in exactly one place and
   * the exact sent text is visible at the action input layer (audit trail).
   */
  message: string;
  /** 'sms' ships in Stage 2.A; 'whatsapp' is modeled but throws NotImplementedError. */
  channel: OtpChannel;
}

export interface SendOtpResult {
  /** Vendor message identifier, for logging / delivery tracking. */
  provider_message_id: string;
  /** Raw vendor payload — debug/audit only, never surfaced to users. */
  vendor_raw?: unknown;
}

// =============================================================================
// ERROR TAXONOMY
// =============================================================================
// All errors thrown by an OtpProvider extend OtpProviderError so callers can
// catch the base class and discriminate via instanceof for distinct recovery.

export class OtpProviderError extends Error {
  /** Vendor identifier, when known ('termii' | 'arkesel'). */
  public readonly vendor?: string;
  /** Raw vendor payload — debugging only, never surface to users. */
  public readonly vendor_raw_response?: unknown;

  constructor(
    message: string,
    options?: { vendor?: string; vendor_raw_response?: unknown; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "OtpProviderError";
    this.vendor = options?.vendor;
    this.vendor_raw_response = options?.vendor_raw_response;
  }
}

/**
 * Provider returned a non-OK response (rejected send, bad sender ID,
 * insufficient balance, unexpected response shape). Action surfaces a generic
 * "could not send verification code, try again" + logs the vendor context.
 */
export class OtpDeliveryError extends OtpProviderError {
  constructor(vendor: string, message: string, vendor_raw_response?: unknown) {
    super(`${vendor} delivery failed: ${message}`, { vendor, vendor_raw_response });
    this.name = "OtpDeliveryError";
  }
}

/**
 * Network / transport failure — no usable response from the provider.
 * Action surfaces the generic message; persistent occurrences are an alert.
 */
export class OtpProviderUnreachableError extends OtpProviderError {
  constructor(vendor: string, cause?: unknown) {
    super(`${vendor} provider unreachable`, { vendor, cause });
    this.name = "OtpProviderUnreachableError";
  }
}

/**
 * The vendor's OWN API throttled us (429-equivalent) — distinct from our
 * app-side rate limits (3/phone/hr, 10/IP/hr) enforced in the action. This is
 * an operational concern, not user behavior. Action surfaces "service
 * temporarily unavailable, try again in a few minutes" + an operator log.
 */
export class OtpRateLimitedError extends OtpProviderError {
  constructor(vendor: string, vendor_raw_response?: unknown) {
    super(`${vendor} provider rate-limited the request`, { vendor, vendor_raw_response });
    this.name = "OtpRateLimitedError";
  }
}

/** Channel not implemented by this provider (e.g. 'whatsapp' in Stage 2.A). */
export class NotImplementedError extends OtpProviderError {
  constructor(vendor: string, channel: string) {
    super(`${vendor} does not implement channel '${channel}' in Stage 2.A`, { vendor });
    this.name = "NotImplementedError";
  }
}
