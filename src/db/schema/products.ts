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
  // Sprint 3 / Gap D.3: free-text city/area where this listing is
  // physically located. Distinct from businesses.city_area (seller's
  // operating location) — a seller in Lagos may publish a listing
  // located in Abuja. Captured at listing create + edit via the
  // EditListingForm cityArea input; required via validateCityArea.
  // Nullable in the schema because pre-D.3 legacy listings may carry
  // NULL until the seller backfills via edit. Mirror added in Feature P
  // to close drift — column already exists in production, no migration
  // generated.
  city_area: text("city_area"),
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
  // E.2.17.0: per-listing stock count. NOT NULL DEFAULT 1. Manually
  // managed by the seller (no auto-decrement; the platform has no
  // purchase events per D-129). UI visibility gated by the listing's
  // category.supports_inventory flag — non-inventory categories ignore
  // this value entirely. quantity=0 surfaces as the "Out of stock"
  // badge on public surfaces while the listing stays status='active'
  // for buyer browsability (status and quantity are orthogonal — status
  // = seller intent, quantity = current stock). DB-level CHECK
  // (products_quantity_nonneg_check) enforces quantity >= 0.
  quantity: integer("quantity").notNull().default(1),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
