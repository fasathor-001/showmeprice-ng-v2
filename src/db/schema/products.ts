import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { businesses } from "./businesses";
import { categories } from "./categories";
import { nigerianStates } from "./nigerian_states";
import { productStatusEnum, currencyEnum } from "./enums";

// Core marketplace object. seller_id is denormalized from business.owner_id;
// trigger in migration SQL keeps them in sync.
export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  business_id: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  seller_id: uuid("seller_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  // Money in kobo (1 NGN = 100 kobo). bigint to survive luxury listings.
  price_kobo: bigint("price_kobo", { mode: "number" }).notNull(),
  currency: currencyEnum("currency").notNull().default("NGN"),
  is_negotiable: boolean("is_negotiable").notNull().default(false),
  category_id: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  state_id: uuid("state_id").references(() => nigerianStates.id, {
    onDelete: "set null",
  }),
  status: productStatusEnum("status").notNull().default("draft"),
  view_count: integer("view_count").notNull().default(0),
  is_featured: boolean("is_featured").notNull().default(false),
  // Phase D.7: category-aware listing fields. Schema lives in
  // src/lib/categorySpecs.ts; this column holds the per-listing values.
  category_specs: jsonb("category_specs"),
  published_at: timestamp("published_at", { withTimezone: true }),
  // E.2.13.0 (Stage 2): admin moderation timestamp. Non-null = listing
  // hidden by admin at this timestamp. NULL = not admin-hidden.
  // Written ONLY by admin via products_admin_all RLS + protected by the
  // products_freeze_hidden_at trigger (D-017 column-freeze pattern) — even
  // a service-role write fails because auth.uid() is NULL under service_role
  // so is_admin(auth.uid()) returns false and the trigger raises.
  // Orthogonal to `status` (admin-hidden is independent of the seller's
  // draft/active/sold/archived lifecycle).
  hidden_at: timestamp("hidden_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
