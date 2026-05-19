import { pgTable, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

// One row per buyer — current credit balance + expiry tracking.
// Credit packs expire 6 months after purchase (spec §11).
// Writes happen exclusively via service_role (credit-pack purchase
// completes → increment available; reveal consumes → decrement). No
// buyer-direct write path — credit_balances is authoritative state
// managed by the payment/reveal flow.
export const creditBalances = pgTable("credit_balances", {
  user_id: uuid("user_id")
    .primaryKey()
    .references(() => profiles.id),
  credits_available: integer("credits_available").default(0),
  credits_purchased_at: timestamp("credits_purchased_at", { withTimezone: true }),
  credits_expire_at: timestamp("credits_expire_at", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type CreditBalance = typeof creditBalances.$inferSelect;
export type NewCreditBalance = typeof creditBalances.$inferInsert;
