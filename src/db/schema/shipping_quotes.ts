import {
  pgTable,
  uuid,
  bigint,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { orders } from "./orders";
import { deliveryPartners } from "./delivery_partners";

// Empty in Phase E; Phase G+ stores per-order delivery-partner quotes.
export const shippingQuotes = pgTable("shipping_quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  order_id: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  delivery_partner_id: uuid("delivery_partner_id").references(
    () => deliveryPartners.id,
    { onDelete: "set null" },
  ),
  quoted_amount_kobo: bigint("quoted_amount_kobo", { mode: "number" }),
  estimated_delivery_days: integer("estimated_delivery_days"),
  quoted_at: timestamp("quoted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ShippingQuote = typeof shippingQuotes.$inferSelect;
export type NewShippingQuote = typeof shippingQuotes.$inferInsert;
