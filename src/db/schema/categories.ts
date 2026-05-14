import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// Two-level taxonomy. parent_id null = top-level.
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  parent_id: uuid("parent_id").references((): AnyPgColumn => categories.id, {
    onDelete: "restrict",
  }),
  sort_order: integer("sort_order").notNull().default(0),
  icon_name: text("icon_name"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Category = typeof categories.$inferSelect;
