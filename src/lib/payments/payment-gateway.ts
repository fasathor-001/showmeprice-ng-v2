// Vendor-agnostic payment gateway interface (D-078).
//
// Phase E ships PaystackGateway as the only working implementation;
// KorapayGateway is named in code as the documented fallback per D-074
// but stays stubbed until Phase F+ or until a Paystack outage forces
// fallback work.
//
// App code never imports a concrete gateway directly. Use
// `getPaymentGateway()` from `./index` to receive the configured
// implementation; tests inject a mock that satisfies this interface.

import type {
  ChargeRequest,
  ChargeInitResult,
  ChargeVerifyResult,
  RefundRequest,
  RefundResult,
  SubscriptionCreateRequest,
  SubscriptionCreateResult,
  SubscriptionCancelResult,
  WebhookResult,
} from "./types";

export interface PaymentGateway {
  /** Vendor identifier — 'paystack', 'korapay', etc. Used for routing webhook events back to their source. */
  readonly vendor: string;

  /**
   * Initiate a one-time charge. Returns the hosted-page URL + provider
   * reference. The caller persists a `payments` row with status='pending'
   * and the provider_reference; the webhook completes the lifecycle.
   *
   * @throws InvalidChargeRequestError if the request shape is invalid
   * @throws GatewayUnreachableError on transport failure
   */
  initiateCharge(request: ChargeRequest): Promise<ChargeInitResult>;

  /**
   * Verify a charge by its provider_reference. Used as a fallback when
   * the webhook hasn't arrived yet (the buyer returns to the callback
   * URL before Paystack's webhook fires).
   *
   * @throws GatewayUnreachableError on transport failure
   */
  verifyCharge(provider_reference: string): Promise<ChargeVerifyResult>;

  /**
   * Refund a completed charge. Phase E: admin-initiated only.
   * @throws DuplicateTransactionError if the refund already exists
   */
  refund(request: RefundRequest): Promise<RefundResult>;

  /**
   * Create a recurring subscription for a Pro tier plan. Returns the
   * subscription identifiers + authorization URL if the buyer needs
   * to enter card details.
   */
  createSubscription(request: SubscriptionCreateRequest): Promise<SubscriptionCreateResult>;

  /**
   * User-initiated cancel — subscription continues to current_period_end,
   * then transitions to status='completed'. Idempotent.
   */
  cancelSubscription(provider_subscription_code: string): Promise<SubscriptionCancelResult>;

  /**
   * Verify a webhook payload's signature. Returns true on valid signature,
   * throws InvalidWebhookSignatureError on mismatch. Separate from
   * `handleWebhook` so callers can short-circuit on bad signatures before
   * spending CPU on payload parsing.
   *
   * @param rawBody — the raw request body as a string (must NOT be re-serialized JSON)
   * @param signature — the vendor's signature header value
   * @throws InvalidWebhookSignatureError on mismatch
   */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;

  /**
   * Parse + translate a vendor webhook payload into a normalized payment
   * event the handler can consume vendor-agnostically (D-078).
   *
   * Implementations should:
   *   1. Call verifyWebhookSignature internally (or accept already-verified input).
   *   2. Parse the vendor payload.
   *   3. Translate to NormalizedPaymentEvent.
   *   4. Return UnhandledVendorEvent for vendor events we don't yet translate
   *      (handler logs + acks).
   *
   * @throws InvalidWebhookSignatureError on mismatch
   */
  handleWebhook(payload: unknown, signature: string): Promise<WebhookResult>;
}
