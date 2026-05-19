import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { categories } from "./categories";
import { nigerianStates } from "./nigerian_states";

// Every marketplace search logged for Phase E analytics (Phase F+
// surfaces insights). Authenticated users INSERT their own row;
// anonymous searches log via service_role (D-070).
export const searchQueryLog = pgTable("search_query_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
  query: text("query").notNull(),
  category_id: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  state_id: uuid("state_id").references(() => nigerianStates.id, {
    onDelete: "set null",
  }),
  results_count: integer("results_count"),
  first_click_position: integer("first_click_position"),
  searched_at: timestamp("searched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SearchQueryLogEntry = typeof searchQueryLog.$inferSelect;
export type NewSearchQueryLogEntry = typeof searchQueryLog.$inferInsert;
