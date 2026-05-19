// Payment gateway error taxonomy. All errors thrown by a `PaymentGateway`
// implementation extend `PaymentGatewayError` so callers can `catch` on
// the base class and discriminate via `instanceof` if specific recovery
// logic is needed.

export class PaymentGatewayError extends Error {
  /** Vendor-supplied identifier for the failing operation, when known. */
  public readonly vendor_reference?: string;
  /** Raw vendor payload — for debugging only, never surface to users. */
  public readonly vendor_raw_response?: unknown;

  constructor(
    message: string,
    options?: { vendor_reference?: string; vendor_raw_response?: unknown; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "PaymentGatewayError";
    this.vendor_reference = options?.vendor_reference;
    this.vendor_raw_response = options?.vendor_raw_response;
  }
}

/**
 * Stub-implementation marker — thrown by Paystack/Korapay gateway methods
 * in E.1.7 until Stage 3 fills in the actual API calls. Production code
 * paths that hit this in Phase E mean the gateway is being called before
 * the implementation is ready; tests should mock the gateway interface
 * rather than relying on the stub.
 */
export class NotImplementedError extends PaymentGatewayError {
  constructor(method: string) {
    super(`PaymentGateway method '${method}' not implemented in Phase E.1.7 scaffolding — see Stage 3 work`);
    this.name = "NotImplementedError";
  }
}

/** Webhook signature didn't match — likely replay or forged request. */
export class InvalidWebhookSignatureError extends PaymentGatewayError {
  constructor(vendor: string) {
    super(`${vendor} webhook signature verification failed`);
    this.name = "InvalidWebhookSignatureError";
  }
}

/** Network / vendor-side outage — caller may retry. */
export class GatewayUnreachableError extends PaymentGatewayError {
  constructor(vendor: string, cause?: unknown) {
    super(`${vendor} gateway unreachable`, { cause });
    this.name = "GatewayUnreachableError";
  }
}

/** Vendor rejected the request as duplicate (idempotency key collision). */
export class DuplicateTransactionError extends PaymentGatewayError {
  constructor(vendor_reference: string) {
    super(`Duplicate transaction: ${vendor_reference}`, { vendor_reference });
    this.name = "DuplicateTransactionError";
  }
}

/** Caller passed an invalid request shape — typically a programming error. */
export class InvalidChargeRequestError extends PaymentGatewayError {
  constructor(message: string) {
    super(`Invalid charge request: ${message}`);
    this.name = "InvalidChargeRequestError";
  }
}
