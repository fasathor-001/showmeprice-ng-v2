import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
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
  // Phase D.7.2: free-form aliases buyers actually type. Lowercased
  // strings; the marketplace search resolves matching categories via
  // `cs.["<lower-of-query>"]` JSONB containment.
  search_aliases: jsonb("search_aliases").notNull().default("[]"),

  // Phase E.1.0: per-category feature flags driving warning banners,
  // high-value markers, and required-field hints. Examples:
  //   {"warning_banner": "Always inspect properties in person"}
  //   {"high_value": true}
  //   {"requires_condition_field": true}
  //   {"requires_year_field": true} for vehicles
  // Phase E uses for the property warning banner (migrated from hardcoded);
  // Phase F+ uses for category-specific Pro pricing and tier restrictions.
  category_features: jsonb("category_features").notNull().default({}),

  // E.2.17.0: per-category inventory eligibility flag. true (default) =
  // listing-creation UI shows the quantity field and public surfaces render
  // the "Out of stock" badge when product.quantity=0. false = single-
  // instance category (vehicles/property/etc.) or categorically-no-
  // inventory (pets/services) — quantity field hidden in the form and
  // badge suppressed in display. Schema-shape flag, not a runtime UI
  // tunable — distinct from category_features JSONB which carries
  // per-row display tunables (warning_banner, high_value, etc.).
  supports_inventory: boolean("supports_inventory").notNull().default(true),

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Category = typeof categories.$inferSelect;
