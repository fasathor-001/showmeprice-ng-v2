// NinVerifier error taxonomy. Parallels PaymentGatewayError shape.

export class NinVerifierError extends Error {
  public readonly vendor_reference?: string;
  public readonly vendor_raw_response?: unknown;

  constructor(
    message: string,
    options?: { vendor_reference?: string; vendor_raw_response?: unknown; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "NinVerifierError";
    this.vendor_reference = options?.vendor_reference;
    this.vendor_raw_response = options?.vendor_raw_response;
  }
}

/**
 * Stub-implementation marker — thrown by Korapay NIN verifier methods
 * in E.1.7 until Stage 2 integration lands (gated on Korapay Identity
 * service approval per D-077).
 */
export class NotImplementedError extends NinVerifierError {
  constructor(method: string) {
    super(`NinVerifier method '${method}' not implemented in Phase E.1.7 scaffolding — see Stage 2 work`);
    this.name = "NotImplementedError";
  }
}

/** Network / vendor-side outage — caller may retry. */
export class VerifierUnreachableError extends NinVerifierError {
  constructor(vendor: string, cause?: unknown) {
    super(`${vendor} NIN verifier unreachable`, { cause });
    this.name = "VerifierUnreachableError";
  }
}

/** NIN format invalid (not 11 digits, contains non-numeric chars). */
export class InvalidNinError extends NinVerifierError {
  constructor(message: string) {
    super(`Invalid NIN: ${message}`);
    this.name = "InvalidNinError";
  }
}

/** Vendor rate-limited the request. */
export class VerifierRateLimitedError extends NinVerifierError {
  constructor(vendor: string, retry_after_seconds?: number) {
    super(
      `${vendor} NIN verifier rate limited${
        retry_after_seconds ? ` — retry after ${retry_after_seconds}s` : ""
      }`,
    );
    this.name = "VerifierRateLimitedError";
  }
}
