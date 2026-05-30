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
  // E.2.18.0: backfilled deterministically from business_name + flipped to
  // NOT NULL. App-time inserts use generateBusinessSlug() (no random
  // suffix — business slugs must be stable + brandable, unlike listing
  // slugs which append random for title-collision uniqueness).
  slug: text("slug").notNull().unique(),
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

  // E.2.11.0: seller WhatsApp number for buyer contact reveal.
  // E.164 without '+' (e.g. 2348012345678). Nullable: NULL = seller chose
  // "use my verified profile phone" (fallback at reveal time is profile.phone).
  // CHECK constraint enforces NULL-or-E.164 format at the DB layer.
  // Written ONLY by the mark_seller_whatsapp_verified RPC (paired with
  // seller_whatsapp_verified_at) — never via direct UPDATE from application
  // code, so the invariant "verified_at non-null IFF current seller_whatsapp
  // was the value that was OTP-proven" is preserved atomically.
  seller_whatsapp: text("seller_whatsapp"),

  // E.2.11.0: when seller_whatsapp was OTP-proven. Non-null = verified,
  // and when. Null = unverified (or seller_whatsapp itself is null).
  // Timestamp serves as both flag and audit trail — no separate boolean.
  seller_whatsapp_verified_at: timestamp("seller_whatsapp_verified_at", {
    withTimezone: true,
  }),

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
