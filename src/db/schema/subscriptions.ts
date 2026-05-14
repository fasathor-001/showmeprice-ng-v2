import { pgTable, uuid, text, timestamp, bigint } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import {
  subscriptionTierEnum,
  subscriptionStatusEnum,
  currencyEnum,
} from "./enums";

// Pro = row with tier='pro', status='active', current_period_end > now().
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  profile_id: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  tier: subscriptionTierEnum("tier").notNull().default("free"),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  paystack_customer_code: text("paystack_customer_code"),
  paystack_subscription_code: text("paystack_subscription_code"),
  paystack_plan_code: text("paystack_plan_code"),
  current_period_start: timestamp("current_period_start", { withTimezone: true }),
  current_period_end: timestamp("current_period_end", { withTimezone: true }),
  amount_kobo: bigint("amount_kobo", { mode: "number" }),
  currency: currencyEnum("currency").notNull().default("NGN"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Subscription = typeof subscriptions.$inferSelect;
