import { pgTable, uuid, jsonb, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { conversations } from "./conversations";
import { profiles } from "./profiles";

// D-120: per-conversation, per-buyer payment-details share events. The active
// share for a conversation has `superseded_at IS NULL`. Re-share (after seller
// updates their registered account) creates a new row + sets superseded_at on
// the old one. The buyer's UI shows a warning when the most-recent share is
// not the one they've already viewed/accepted.
//
// `account_snapshot` is a jsonb capture of the registered account at share
// time: `{bank_name, account_name, account_number_encrypted}`. The
// `account_number_encrypted` field is the ciphertext copied verbatim from
// seller_payout_accounts — no decrypt/re-encrypt cycle, no plaintext at rest.
// CHECK constraint guarantees the three keys are present.
//
// RLS (5 policies):
//   - seller can SELECT shares they sent (seller_id = auth.uid())
//   - buyer can SELECT shares directed to them (buyer_id = auth.uid())
//   - seller can INSERT (with CHECK seller_id = auth.uid())
//   - buyer can UPDATE (viewed_at / warning_accepted_at)
//   - seller can UPDATE (to set superseded_at on re-share)
export const paymentDetailShares = pgTable(
  "payment_detail_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversation_id: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    seller_id: uuid("seller_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    buyer_id: uuid("buyer_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    account_snapshot: jsonb("account_snapshot").notNull(),
    shared_at: timestamp("shared_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    buyer_viewed_at: timestamp("buyer_viewed_at", { withTimezone: true }),
    buyer_warning_accepted_at: timestamp("buyer_warning_accepted_at", {
      withTimezone: true,
    }),
    // When the seller updates their payout account + re-shares, the old row
    // gets superseded_at set; the new row has it NULL. Buyer UI compares
    // shares ordered by shared_at; warning shown when active != last-viewed.
    superseded_at: timestamp("superseded_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    snapshotShape: check(
      "payment_detail_shares_snapshot_shape",
      sql`jsonb_typeof(${t.account_snapshot}) = 'object'
        AND ${t.account_snapshot} ? 'bank_name'
        AND ${t.account_snapshot} ? 'account_name'
        AND ${t.account_snapshot} ? 'account_number_encrypted'`,
    ),
  }),
);

export type PaymentDetailShare = typeof paymentDetailShares.$inferSelect;
export type NewPaymentDetailShare = typeof paymentDetailShares.$inferInsert;
