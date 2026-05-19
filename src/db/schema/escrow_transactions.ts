import { pgTable, uuid, text, bigint, timestamp } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

// Empty in Phase E; Phase G+ populates with escrow hold/release/refund
// records. Forms circular FK with orders (escrow_transactions.order_id
// ↔ orders.escrow_id) — orders.ts handles the back-reference; here we
// reference orders.id via lazy callback to avoid an import cycle at
// module-load time.
//
// Using an inline AnyPgColumn typed callback for the orders.id reference
// to keep TypeScript happy when orders.ts imports this module.
import { orders } from "./orders";

export const escrowTransactions = pgTable("escrow_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  order_id: uuid("order_id")
    .notNull()
    .references((): AnyPgColumn => orders.id, { onDelete: "restrict" }),
  buyer_id: uuid("buyer_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  seller_id: uuid("seller_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  amount_kobo: bigint("amount_kobo", { mode: "number" }),
  // 'monnify' / 'paystack'
  payment_provider: text("payment_provider"),
  provider_reference: text("provider_reference"),
  // 'held' / 'released' / 'refunded' / 'disputed'
  status: text("status"),
  held_at: timestamp("held_at", { withTimezone: true }),
  released_at: timestamp("released_at", { withTimezone: true }),
  refunded_at: timestamp("refunded_at", { withTimezone: true }),
});

export type EscrowTransaction = typeof escrowTransactions.$inferSelect;
export type NewEscrowTransaction = typeof escrowTransactions.$inferInsert;
