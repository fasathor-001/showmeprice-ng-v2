import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";

// Admin-editable PII filter rules. Seeded in E.1.5 with the initial
// 14-row Nigerian-tuned ruleset (spec §10). Public-read (TO authenticated,
// anon) gated on active=TRUE so clients can render filter UI hints;
// admin-all for editing.
//
// Lookup pattern from server actions:
//   filter_rules.select('*')
//     .eq('active', true)
//     .contains('applies_to_context', [context])  // 'message' | 'listing_description'
//     .contains('applies_to_tier', [tier])         // 'free' | 'pro'
//
// Canonical context strings are 'message' and 'listing_description' (D-070);
// canonical tier strings match profiles.tier.
export const filterRules = pgTable("filter_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  // 'phone' / 'whatsapp_link' / 'telegram_link' / 'signal_link' / 'nuban'
  // / 'payment_url' / 'shortened_url' / 'email' / 'social_handle'
  rule_type: text("rule_type").notNull(),
  // Regex pattern, stored as plain text; consumed by app-side regex engine.
  // PG-side: store literally with no escaping. JS-side: `new RegExp(pattern)`.
  pattern: text("pattern").notNull(),
  // CHECK constraint enforces values: 'block' | 'warn' | 'allow'.
  // 'allow' is reserved for future admin-added whitelist overrides; not
  // present in the E.1.5 seed.
  action: text("action").notNull(),
  // E.g. ['free'] for warn-then-allow on free buyers; ['free','pro'] for
  // universal rules.
  applies_to_tier: text("applies_to_tier").array(),
  // E.g. ['message'], ['listing_description'], or both.
  applies_to_context: text("applies_to_context").array(),
  description: text("description"),
  active: boolean("active").default(true),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type FilterRule = typeof filterRules.$inferSelect;
export type NewFilterRule = typeof filterRules.$inferInsert;
