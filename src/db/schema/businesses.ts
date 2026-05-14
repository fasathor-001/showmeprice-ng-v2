import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
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
    .default("unverified"),
  rejection_reason: text("rejection_reason"),
  is_disabled: boolean("is_disabled").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
