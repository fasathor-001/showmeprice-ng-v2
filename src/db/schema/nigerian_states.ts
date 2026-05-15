import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

// 36 states + FCT. Seeded once.
// Phase D adds `slug` (URL-friendly identifier, e.g. 'lagos', 'akwa-ibom').
// Featured-state ordering lives in src/lib/states.ts (FEATURED_STATE_SLUGS).
export const nigerianStates = pgTable("nigerian_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  iso_code: text("iso_code").notNull().unique(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NigerianState = typeof nigerianStates.$inferSelect;
