import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  jsonb,
} from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

// Provider-agnostic payment record. Phase E populates via Paystack only
// (D-074 / D-078); Phase F+ may add Flutterwave, Phase G+ adds Monnify
// for escrow flows.
//
// One row per payment attempt — success and failure both. The
// payment_provider + provider_transaction_id pair is the natural
// cross-reference back to the gateway dashboard.
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").references(() => profiles.id),
  payment_provider: text("payment_provider").notNull().default("paystack"),
  provider_transaction_id: text("provider_transaction_id"),
  amount_kobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  // 'credit_pack' | 'subscription_initial' | 'subscription_renewal' | 'refund'
  payment_type: text("payment_type").notNull(),
  // 'pending' | 'success' | 'failed' | 'refunded'
  status: text("status").notNull(),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  completed_at: timestamp("completed_at", { withTimezone: true }),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
