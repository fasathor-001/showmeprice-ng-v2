import { pgEnum } from "drizzle-orm/pg-core";

// D-004: every user starts as buyer. seller is a superset.
export const userTypeEnum = pgEnum("user_type", ["buyer", "seller"]);

// D-005: role reserved for admin elevation only.
export const userRoleEnum = pgEnum("user_role", ["admin"]);

// D-007: verification lives on businesses.
export const verificationStatusEnum = pgEnum("verification_status", [
  "unverified",
  "pending",
  "verified",
  "rejected",
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
