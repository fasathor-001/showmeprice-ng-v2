import {
  pgTable,
  uuid,
  text,
  boolean,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";

// Tier × feature_key matrix. Seeded in E.1.5 with free + pro rows
// (Phase G+ adds premium; Phase H+ adds institution).
//
// Lookup pattern: "does this tier have this feature?" — row exists +
// enabled=true means yes; missing row means no. Public-read RLS (anon +
// authenticated) drives the pricing page; admin-all RLS for editing.
export const tierFeatures = pgTable(
  "tier_features",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // 'free' / 'pro' / 'premium' / 'institution' — text not enum so new
    // tiers can be added without enum-alter migrations.
    tier: text("tier").notNull(),
    feature_key: text("feature_key").notNull(),
    enabled: boolean("enabled").default(true),
    // Free-form metadata: description shown on pricing page, feature-flag
    // params, etc. NOT NULL DEFAULT '{}' — never insert explicit NULL here.
    metadata: jsonb("metadata"),
  },
  (table) => ({
    tierFeatureUnique: unique("tier_features_tier_feature_key_key").on(
      table.tier,
      table.feature_key,
    ),
  }),
);

export type TierFeature = typeof tierFeatures.$inferSelect;
export type NewTierFeature = typeof tierFeatures.$inferInsert;
