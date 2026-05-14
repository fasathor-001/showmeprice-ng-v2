import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";
import { products } from "./products";

export const productImages = pgTable("product_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  product_id: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  // Supabase Storage path: "products/{product_id}/{filename}"
  storage_path: text("storage_path").notNull(),
  position: integer("position").notNull().default(0),
  alt_text: text("alt_text"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProductImage = typeof productImages.$inferSelect;
