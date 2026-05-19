import { pgTable, uuid, timestamp, boolean } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { products } from "./products";
import { payments } from "./payments";

// Reshaped in Phase E.1.1 (D-055) — Phase A's channel/ip_hash/created_at
// columns dropped, new credit-or-subscription tracking columns landed.
// Column product_id renamed to listing_id (spec §11 / D-055).
//
// Note: production FK constraint name `contact_reveals_product_id_products_id_fk`
// still references the old column name (cosmetic only; the constraint
// functionally points at listing_id post-rename). See D-080. Rename target:
// `contact_reveals_listing_id_products_id_fkey` in the maintenance window.
//
// Conversion event for Pro tier — one row per buyer reveal tap.
export const contactReveals = pgTable("contact_reveals", {
  id: uuid("id").primaryKey().defaultRandom(),
  buyer_id: uuid("buyer_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  listing_id: uuid("listing_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  seller_id: uuid("seller_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  revealed_at: timestamp("revealed_at", { withTimezone: true }).notNull().defaultNow(),
  // True if this reveal consumed a credit pack credit; false if covered by
  // an active Pro subscription.
  credit_used: boolean("credit_used").notNull().default(false),
  // Links to the credit-pack purchase that funded this reveal, when
  // credit_used=true. Null for subscription-covered reveals.
  payment_id: uuid("payment_id").references(() => payments.id),
});

export type ContactReveal = typeof contactReveals.$inferSelect;
export type NewContactReveal = typeof contactReveals.$inferInsert;
