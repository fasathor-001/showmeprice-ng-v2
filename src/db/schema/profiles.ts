import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { userTypeEnum, userRoleEnum } from "./enums";
import { nigerianStates } from "./nigerian_states";

// D-004 / D-005: user_type is canonical; role is admin-only.
// profiles.id mirrors auth.users.id (cross-schema FK in migration SQL).
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  display_name: text("display_name").notNull(),
  handle: text("handle").unique(),
  // D-009: E.164 without "+". Renamed from whatsapp_number in Phase E.1.0
  // (D-055) — the column holds the user's primary contact phone, which in
  // Nigerian context is typically their WhatsApp number.
  phone: text("phone").notNull().unique(),
  user_type: userTypeEnum("user_type").notNull().default("buyer"),
  role: userRoleEnum("role"),
  avatar_path: text("avatar_path"),
  is_disabled: boolean("is_disabled").notNull().default(false),

  // Phase E.1.0: verification methods completed.
  // Phase E.1: 'phone_verified', optionally 'email_verified'.
  // Phase F+: adds 'google_verified', 'facebook_verified'.
  // Phase H+: adds 'bvn_verified', 'nin_verified' for high-value flows.
  verification_status: text("verification_status")
    .array()
    .notNull()
    .default([]),

  // Phase E.1.0: linked sign-in methods. Phase E.1: ['termii_phone'].
  // Phase F+: ['termii_phone', 'google'] etc.
  auth_providers: text("auth_providers")
    .array()
    .notNull()
    .default([]),

  // Phase E.1.0: legal full name (may differ from display_name).
  // Set during seller verification (Phase C.5) or by Pro buyer optional
  // profile completion.
  full_name: text("full_name"),

  // Phase E.1.0: buyer's state of residence. Used for enhanced-buyer-profile
  // surfacing (D-007 Pro feature) and Phase F+ geographic analytics.
  state_id: uuid("state_id").references(() => nigerianStates.id),

  // Phase E.1.0: buyer tier for Pro feature gating. Distinct from
  // businesses.seller_tier (one user can be a Pro buyer and a Verified
  // seller simultaneously).
  // Values: 'free' / 'pro' / 'premium' (Phase G+) / 'institution' (Phase H+).
  // Text not enum so new tiers can be added without an enum-alter migration.
  tier: text("tier").notNull().default("free"),
  tier_started_at: timestamp("tier_started_at", { withTimezone: true }),
  tier_expires_at: timestamp("tier_expires_at", { withTimezone: true }),

  // Stage 2.B / D-109 (migration E.2.5.0). Persistent last-seen signal,
  // written by messaging actions on send / open-thread / open-list. Nullable;
  // no backfill. Asymmetric DISPLAY (seller→buyer yes, buyer→seller no) is a
  // Stage 2.C UI concern — the column just stores the timestamp.
  last_seen_at: timestamp("last_seen_at", { withTimezone: true }),

  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
