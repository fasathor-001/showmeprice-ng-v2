import {
  pgTable,
  uuid,
  text,
  bigint,
  integer,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { products } from "./products";

// Buyer bookmarks. Phase E ships bookmarks-only; schema accommodates
// Phase F+ notes + price alerts and Phase G+ cart semantics without
// future migration.
export const savedListings = pgTable(
  "saved_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyer_id: uuid("buyer_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    note: text("note"), // Phase F+
    alert_price_threshold: bigint("alert_price_threshold", { mode: "number" }), // Phase F+
    quantity: integer("quantity"), // Phase G+ cart
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    buyerProductUnique: unique("saved_listings_buyer_id_product_id_key").on(
      table.buyer_id,
      table.product_id,
    ),
  }),
);

export type SavedListing = typeof savedListings.$inferSelect;
export type NewSavedListing = typeof savedListings.$inferInsert;
