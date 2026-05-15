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

export const subscriptionTierEnum = pgEnum("subscription_tier", ["free", "pro"]);

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
