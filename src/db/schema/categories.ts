import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// Two-level taxonomy. parent_id null = top-level.
//
// Phase D adds `tier` (1/2/3) to the top-level categories:
//   tier 1 = featured on home page (6 parents)
//   tier 2 = in main nav, not on hero (4 parents)
//   tier 3 = "more categories" expandable section (6 parents)
// Subcategories inherit display alongside their parent — tier is meaningful
// only for top-level rows but the column is NOT NULL DEFAULT 3 so any new
// inserts land safely in the lowest tier.
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  parent_id: uuid("parent_id").references((): AnyPgColumn => categories.id, {
    onDelete: "restrict",
  }),
  sort_order: integer("sort_order").notNull().default(0),
  icon_name: text("icon_name"),
  tier: integer("tier").notNull().default(3),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Category = typeof categories.$inferSelect;
