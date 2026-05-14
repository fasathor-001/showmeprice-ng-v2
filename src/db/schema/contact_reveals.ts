import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { products } from "./products";

// Conversion event. One row per buyer reveal click.
export const contactReveals = pgTable("contact_reveals", {
  id: uuid("id").primaryKey().defaultRandom(),
  buyer_id: uuid("buyer_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  product_id: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  seller_id: uuid("seller_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  // "whatsapp" | "phone" — text not enum since we may add channels later.
  channel: text("channel").notNull(),
  ip_hash: text("ip_hash"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ContactReveal = typeof contactReveals.$inferSelect;
