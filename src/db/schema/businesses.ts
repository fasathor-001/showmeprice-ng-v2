import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { nigerianStates } from "./nigerian_states";
import { verificationStatusEnum } from "./enums";

// D-007: verification status lives here.
// One business per profile (UNIQUE on owner_id).
export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner_id: uuid("owner_id")
    .notNull()
    .unique()
    .references(() => profiles.id, { onDelete: "cascade" }),
  business_name: text("business_name").notNull(),
  slug: text("slug").unique(),
  description: text("description"),
  state_id: uuid("state_id").references(() => nigerianStates.id, { onDelete: "set null" }),
  logo_path: text("logo_path"),
  verification_status: verificationStatusEnum("verification_status")
    .notNull()
    .default("unsubmitted"),
  rejection_reason: text("rejection_reason"),
  is_disabled: boolean("is_disabled").notNull().default(false),

  // Phase E.1.0: seller tier (distinct from buyer-side profiles.tier).
  // Values: 'free' / 'verified' (post-identity-verification baseline).
  // Phase F+: 'pro_seller' / 'premium_seller'. Phase G+: 'enterprise_seller'.
  // Backfilled during E.1.0 migration: rows with verification_status='verified'
  // got 'verified'; everything else got 'free'.
  seller_tier: text("seller_tier").notNull().default("free"),

  // Phase E.1.0: per-seller listing limit. Null = unlimited (Phase E).
  // Phase F+ populates with per-tier caps and enforces in createListingAction.
  seller_listing_limit: integer("seller_listing_limit"),

  // Phase E.1.0: per-seller reply quota. Null = unlimited (Phase E,
  // tracking only). Phase F+ enforces per tier.
  seller_reply_quota: integer("seller_reply_quota"),

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
