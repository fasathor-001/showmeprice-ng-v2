import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { filterRules } from "./filter_rules";

// Records every PII-filter action: warning shown, block triggered,
// user-proceeded-anyway. Drives admin rule-tuning + filter effectiveness
// review.
//
// rule_id FK added in E.1.5 (deferred from E.1.2 by design — filter_rules
// didn't exist when filter_actions_log was created). Production constraint
// name is `filter_actions_log_rule_id_filter_rules_id_fk` (Drizzle-style);
// to be renamed to `_fkey` in the D-080 maintenance window for Phase E
// consistency.
export const filterActionsLog = pgTable("filter_actions_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
  // 'message' / 'listing_description'
  context: text("context"),
  // message_id or product_id (untyped UUID — context discriminates).
  context_id: uuid("context_id"),
  rule_id: uuid("rule_id").references(() => filterRules.id, { onDelete: "set null" }),
  rule_action: text("rule_action"),
  original_content: text("original_content"),
  // Did the user send anyway after a soft warning?
  user_proceeded: boolean("user_proceeded"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FilterActionsLogEntry = typeof filterActionsLog.$inferSelect;
export type NewFilterActionsLogEntry = typeof filterActionsLog.$inferInsert;
