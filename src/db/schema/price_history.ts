import { pgTable, uuid, bigint, timestamp } from "drizzle-orm/pg-core";
import { products } from "./products";
import { profiles } from "./profiles";

// Append-only price-change log on products. Written by the
// products_price_change_log trigger (AFTER UPDATE OF price_kobo) via
// the log_product_price_change() SECURITY DEFINER function. Application
// code must NEVER write directly — all writes go through the trigger
// so attribution + timing stay consistent.
//
// Per D-071, changed_by is populated from NEW.seller_id (best-effort).
// Admin price overrides — the ~1% case — are captured separately in
// admin_action_log with full admin attribution.
//
// Phase E logs; Phase F+ surfaces (price-drop alerts via saved_listings).
export const priceHistory = pgTable("price_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  product_id: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  price_kobo: bigint("price_kobo", { mode: "number" }).notNull(),
  changed_at: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  changed_by: uuid("changed_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
});

export type PriceHistoryEntry = typeof priceHistory.$inferSelect;
export type NewPriceHistoryEntry = typeof priceHistory.$inferInsert;
