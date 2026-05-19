import { pgTable, uuid, text, timestamp, bigint } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { payments } from "./payments";

// Append-only log of every tier change. Drives "Pro for X months"
// displays, churn analytics, and refund audit.
//
// Writes happen via service_role on Paystack webhook events
// (subscription_create / subscription_disable / payment_failed / etc.)
// and admin actions (manual upgrade/refund). Each row carries the
// payment_id when a payment is involved, NULL for admin-driven changes.
export const userTierHistory = pgTable("user_tier_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").references(() => profiles.id),
  from_tier: text("from_tier"),
  to_tier: text("to_tier"),
  // 'upgrade' / 'downgrade' / 'cancellation' / 'refund' / 'admin_action'
  reason: text("reason"),
  amount_paid_kobo: bigint("amount_paid_kobo", { mode: "number" }),
  payment_id: uuid("payment_id").references(() => payments.id),
  changed_at: timestamp("changed_at", { withTimezone: true }).defaultNow(),
});

export type UserTierHistoryEntry = typeof userTierHistory.$inferSelect;
export type NewUserTierHistoryEntry = typeof userTierHistory.$inferInsert;
