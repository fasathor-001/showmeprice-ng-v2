import { pgTable, uuid, text } from "drizzle-orm/pg-core";
import { categories } from "./categories";

// Empty in Phase E; Phase G+ uses for prescription items, firearms,
// age-gated categories. category_id is both PK and FK to categories.id
// — one restriction record per restricted category.
export const restrictedCategories = pgTable("restricted_categories", {
  category_id: uuid("category_id")
    .primaryKey()
    .references(() => categories.id, { onDelete: "cascade" }),
  // 'requires_verification' / 'requires_kyc' / 'banned'
  restriction_type: text("restriction_type"),
  min_seller_tier: text("min_seller_tier"),
  notes: text("notes"),
});

export type RestrictedCategory = typeof restrictedCategories.$inferSelect;
export type NewRestrictedCategory = typeof restrictedCategories.$inferInsert;
