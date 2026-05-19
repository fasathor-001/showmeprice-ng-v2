import { pgTable, uuid, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { categories } from "./categories";
import { nigerianStates } from "./nigerian_states";

// Empty in Phase E; Phase F+ ships as Pro buyer feature
// (re-run a search on demand or alert when matches arrive).
export const savedSearches = pgTable("saved_searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  buyer_id: uuid("buyer_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  query: text("query"),
  category_id: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  state_id: uuid("state_id").references(() => nigerianStates.id, {
    onDelete: "set null",
  }),
  filters: jsonb("filters"),
  alert_enabled: boolean("alert_enabled").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SavedSearch = typeof savedSearches.$inferSelect;
export type NewSavedSearch = typeof savedSearches.$inferInsert;
