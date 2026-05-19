import { pgTable, uuid, text, bigint, timestamp } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { products } from "./products";
import { conversations } from "./conversations";
import { shippingAddresses } from "./shipping_addresses";
import { deliveryPartners } from "./delivery_partners";
import { escrowTransactions } from "./escrow_transactions";

// Empty in Phase E; Phase G+ canonical fulfillment table.
// Supersedes Phase A's escrow_orders per D-072 (migration map in DECISIONS.md).
//
// Forms circular FK with escrow_transactions (orders.escrow_id ↔
// escrow_transactions.order_id). In SQL the cycle was resolved by
// CREATE TABLE both first, then ALTER TABLE orders ADD CONSTRAINT.
// In Drizzle the lazy `references(() => ...)` callbacks handle the
// circular import naturally.
export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  buyer_id: uuid("buyer_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  seller_id: uuid("seller_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  listing_id: uuid("listing_id").references(() => products.id, {
    onDelete: "set null",
  }),
  conversation_id: uuid("conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  // 'pending' / 'paid' / 'shipped' / 'delivered' / 'completed' /
  // 'disputed' / 'refunded'
  status: text("status"),
  amount_kobo: bigint("amount_kobo", { mode: "number" }),
  escrow_id: uuid("escrow_id").references(() => escrowTransactions.id, {
    onDelete: "set null",
  }),
  shipping_address_id: uuid("shipping_address_id").references(
    () => shippingAddresses.id,
    { onDelete: "set null" },
  ),
  delivery_partner_id: uuid("delivery_partner_id").references(
    () => deliveryPartners.id,
    { onDelete: "set null" },
  ),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paid_at: timestamp("paid_at", { withTimezone: true }),
  shipped_at: timestamp("shipped_at", { withTimezone: true }),
  delivered_at: timestamp("delivered_at", { withTimezone: true }),
  completed_at: timestamp("completed_at", { withTimezone: true }),
});

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
