import { pgEnum } from "drizzle-orm/pg-core";

// D-004: every user starts as buyer. seller is a superset.
export const userTypeEnum = pgEnum("user_type", ["buyer", "seller"]);

// D-005: role reserved for admin elevation only.
export const userRoleEnum = pgEnum("user_role", ["admin"]);

// D-007: verification lives on businesses.
// 'unsubmitted' added in Phase C.5 P.1 (default for new businesses, before
// any seller_verifications submission). 'unverified' is dormant (Phase A's
// original default before P.1).
export const verificationStatusEnum = pgEnum("verification_status", [
  "unverified",
  "unsubmitted",
  "pending",
  "verified",
  "rejected",
]);

// Phase C.5 P.1: identity-document type for seller verification.
export const idDocumentTypeEnum = pgEnum("id_document_type", [
  "nin_slip",
  "drivers_license",
  "voters_card",
  "international_passport",
]);

// DEPRECATED post-E.1.1 (D-055). The reshaped subscriptions table uses
// text `plan_code` instead of this enum. Retained here because the
// Postgres enum type still exists in the schema; safe to drop in
// Phase F+ once we're certain nothing references it.
export const subscriptionTierEnum = pgEnum("subscription_tier", ["free", "pro"]);

// DEPRECATED post-E.1.1 (D-055). The reshaped subscriptions table uses
// text `status` with values 'active' / 'attention' / 'non-renewing' /
// 'completed' / 'cancelled' (Paystack subscription states). Retained
// here because the Postgres enum still exists.
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "cancelled",
  "expired",
]);

export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "active",
  "sold",
  "archived",
]);

// D-008: Naira only.
export const currencyEnum = pgEnum("currency", ["NGN"]);

export const escrowOrderStatusEnum = pgEnum("escrow_order_status", [
  "initiated",
  "funded",
  "shipped",
  "delivered",
  "released",
  "disputed",
  "refunded",
  "cancelled",
]);

// Phase E.1.0: notification event taxonomy. Used by notification_preferences
// and notification_log. 13 values covering messaging, billing, moderation,
// and admin communication. New event types are added via ALTER TYPE
// notification_event ADD VALUE — never reorder or drop existing values.
export const notificationEventEnum = pgEnum("notification_event", [
  "new_message",
  "seller_reply",
  "listing_sold",
  "price_drop",
  "verification_status_change",
  "pro_renewal_upcoming",
  "pro_renewal_succeeded",
  "pro_renewal_failed",
  "pro_subscription_ending",
  "report_action_taken",
  "admin_message",
  "listing_reported",
  "listing_hidden",
]);

// Phase E.1.0: target type discriminator for moderation reports.
export const reportTargetTypeEnum = pgEnum("report_target_type", [
  "listing",
  "user",
  "message",
]);

// Phase E.1.0: report lifecycle state.
export const reportStatusEnum = pgEnum("report_status", [
  "new",
  "in_review",
  "resolved",
  "dismissed",
]);
