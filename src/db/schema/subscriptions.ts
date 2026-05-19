import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

// Reshaped in Phase E.1.1 (D-055) — Phase A's tier/paystack_* columns dropped,
// new payment-provider-agnostic structure landed. Plan identity is now in
// `plan_code` (TEXT, not enum) — see Paystack plans in spec §12:
//   pro_monthly_launch / pro_monthly_standard / pro_annual_launch / pro_annual_standard.
//
// Note: production FK constraint name is `subscriptions_profile_id_profiles_id_fk`
// (predates the column rename profile_id → user_id in E.1.1; Drizzle wrote it
// against the old column name). Cosmetic only — see D-080. Drizzle does not
// read constraint names; references() generates a fresh one if Drizzle ever
// drives schema. Production retains the legacy name until the D-080
// maintenance window.
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),

  // Payment provider this subscription is bound to. Phase E: always 'paystack'.
  // Phase F+: 'flutterwave' if we add a fallback. Phase G+: 'monnify' for
  // escrow-coupled subs. Stored explicitly so the PaymentGateway impl
  // selection at webhook-handle time is data-driven, not code-coupled.
  payment_provider: text("payment_provider").notNull().default("paystack"),

  // Provider-side subscription reference (Paystack subscription_code).
  provider_subscription_code: text("provider_subscription_code"),

  // Plan identifier — string code matching the Paystack plan dashboard.
  // No enum: allows new plans (annual_promo_2027, etc.) without migrations.
  plan_code: text("plan_code").notNull().default("unknown"),

  // Lifecycle state mirroring Paystack subscription states:
  // 'active' / 'attention' / 'non-renewing' / 'completed' / 'cancelled'.
  // Text rather than enum so new states from Paystack don't require migrations.
  status: text("status").notNull().default("active"),

  started_at: timestamp("started_at", { withTimezone: true }),
  current_period_start: timestamp("current_period_start", { withTimezone: true }),
  current_period_end: timestamp("current_period_end", { withTimezone: true }),

  // Set by user-initiated cancel; provider keeps subscription active until
  // current_period_end, then transitions to status='completed'.
  cancel_at_period_end: boolean("cancel_at_period_end").notNull().default(false),
  cancelled_at: timestamp("cancelled_at", { withTimezone: true }),

  payment_method: text("payment_method"),

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
