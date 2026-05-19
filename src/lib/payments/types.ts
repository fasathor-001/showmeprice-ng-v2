// Vendor-agnostic payment types. Consumed by the `PaymentGateway` interface
// and all server actions that initiate charges / verify payments / handle
// webhooks. Phase E ships Paystack as the only implementation; Phase F+
// may add Flutterwave; Phase G+ adds Monnify for escrow. The handler-level
// types stay constant across vendor swaps (D-078).

// =============================================================================
// CHARGE — one-time payment (credit pack purchase, etc.)
// =============================================================================

export type PaymentType =
  | "credit_pack"
  | "subscription_initial"
  | "subscription_renewal"
  | "refund";

export interface ChargeRequest {
  user_id: string;
  amount_kobo: number;
  currency: "NGN";
  payment_type: PaymentType;
  /**
   * Buyer's email — required by Paystack's transaction-initialize endpoint
   * even when the buyer pays via direct debit. We pass the profile's email
   * when one is set; otherwise the application falls back to a configured
   * support address with the buyer's phone in metadata for reconciliation.
   */
  email: string;
  /** Free-form provider metadata, surfaced back on webhook payloads. */
  metadata?: Record<string, unknown>;
}

export interface ChargeInitResult {
  /** Provider transaction reference (Paystack: `reference`). */
  provider_reference: string;
  /** Hosted-page URL the buyer is redirected to for payment. */
  authorization_url: string;
  /** Access code used by the inline checkout JS (Paystack-specific). */
  access_code?: string;
}

export interface ChargeVerifyResult {
  provider_reference: string;
  status: "pending" | "success" | "failed";
  amount_kobo: number;
  currency: "NGN";
  /** Vendor payload for debug / audit, never surfaced to buyers. */
  vendor_raw_response?: unknown;
}

// =============================================================================
// REFUND
// =============================================================================

export interface RefundRequest {
  /** The original charge's provider_reference. */
  provider_reference: string;
  amount_kobo: number;
  /** Admin-supplied reason, surfaced in the refund email to the buyer. */
  reason: string;
}

export interface RefundResult {
  provider_refund_reference: string;
  status: "pending" | "completed" | "failed";
  vendor_raw_response?: unknown;
}

// =============================================================================
// SUBSCRIPTION — recurring Pro tier
// =============================================================================

export interface SubscriptionCreateRequest {
  user_id: string;
  /**
   * Plan identifier matching the provider dashboard plan code.
   * Phase E values: 'pro_monthly_launch', 'pro_monthly_standard',
   * 'pro_annual_launch', 'pro_annual_standard'.
   */
  plan_code: string;
  /** Buyer email — Paystack requires it on customer creation. */
  email: string;
}

export interface SubscriptionCreateResult {
  provider_subscription_code: string;
  provider_customer_code: string;
  /**
   * Hosted-page URL for the initial-charge authorization if the buyer
   * needs to enter card details. Null if the customer is already tokenized
   * (e.g., they upgraded from a credit pack purchase on the same card).
   */
  authorization_url: string | null;
  vendor_raw_response?: unknown;
}

export interface SubscriptionCancelResult {
  provider_subscription_code: string;
  /** True = subscription will not renew at current_period_end. */
  cancel_at_period_end: boolean;
  vendor_raw_response?: unknown;
}

// =============================================================================
// NORMALIZED WEBHOOK EVENTS (CALL 2 / D-078)
// =============================================================================
// Discriminated union — every vendor implementation translates its native
// webhook payload to one of these event types. Handlers consume the union;
// adding a vendor never requires changes to handler code.

export interface NormalizedChargeSucceededEvent {
  type: "charge.succeeded";
  provider_reference: string;
  amount_kobo: number;
  currency: "NGN";
  metadata: Record<string, unknown>;
  paid_at: string; // ISO timestamp
  vendor_raw_response: unknown;
}

export interface NormalizedChargeFailedEvent {
  type: "charge.failed";
  provider_reference: string;
  amount_kobo: number;
  currency: "NGN";
  /** Vendor failure code (e.g. 'insufficient_funds', 'declined'). */
  failure_reason: string;
  vendor_raw_response: unknown;
}

export interface NormalizedSubscriptionCreatedEvent {
  type: "subscription.created";
  provider_subscription_code: string;
  provider_customer_code: string;
  plan_code: string;
  user_id: string; // resolved from metadata or customer email at translation time
  started_at: string;
  current_period_start: string;
  current_period_end: string;
  vendor_raw_response: unknown;
}

export interface NormalizedSubscriptionRenewedEvent {
  type: "subscription.renewed";
  provider_subscription_code: string;
  /** Reference of the renewal charge that funded this period. */
  charge_provider_reference: string;
  amount_kobo: number;
  current_period_start: string;
  current_period_end: string;
  vendor_raw_response: unknown;
}

export interface NormalizedSubscriptionPaymentFailedEvent {
  type: "subscription.payment_failed";
  provider_subscription_code: string;
  /** When the provider will retry, if it will. */
  next_retry_at: string | null;
  failure_reason: string;
  vendor_raw_response: unknown;
}

export interface NormalizedSubscriptionCancelledEvent {
  type: "subscription.cancelled";
  provider_subscription_code: string;
  /** True = user-initiated cancel; false = provider-side hard-cancel after retry exhaustion. */
  cancelled_by_user: boolean;
  cancelled_at: string;
  vendor_raw_response: unknown;
}

export interface NormalizedRefundCompletedEvent {
  type: "refund.completed";
  provider_refund_reference: string;
  /** Reference of the original charge being refunded. */
  charge_provider_reference: string;
  amount_kobo: number;
  vendor_raw_response: unknown;
}

/**
 * Discriminated union of all normalized payment events. Webhook handlers
 * switch on `event.type` — exhaustiveness checked by TypeScript.
 */
export type NormalizedPaymentEvent =
  | NormalizedChargeSucceededEvent
  | NormalizedChargeFailedEvent
  | NormalizedSubscriptionCreatedEvent
  | NormalizedSubscriptionRenewedEvent
  | NormalizedSubscriptionPaymentFailedEvent
  | NormalizedSubscriptionCancelledEvent
  | NormalizedRefundCompletedEvent;

/**
 * Returned by handleWebhook when the payload is a vendor event we don't
 * (yet) translate to a normalized form — e.g. customer.identification_failed
 * which doesn't map to a NormalizedPaymentEvent. Handler should log and ack.
 */
export interface UnhandledVendorEvent {
  type: "vendor.unhandled";
  vendor_event_name: string;
  vendor_raw_response: unknown;
}

export type WebhookResult = NormalizedPaymentEvent | UnhandledVendorEvent;
