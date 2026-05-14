import { pgTable, uuid, text, timestamp, bigint } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { products } from "./products";
import { escrowOrderStatusEnum, currencyEnum } from "./enums";

// Phase H stub — schema only for now.
export const escrowOrders = pgTable("escrow_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  product_id: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  buyer_id: uuid("buyer_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  seller_id: uuid("seller_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  amount_kobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: currencyEnum("currency").notNull().default("NGN"),
  status: escrowOrderStatusEnum("status").notNull().default("initiated"),
  paystack_transaction_reference: text("paystack_transaction_reference"),
  shipping_note: text("shipping_note"),
  dispute_reason: text("dispute_reason"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EscrowOrder = typeof escrowOrders.$inferSelect;
