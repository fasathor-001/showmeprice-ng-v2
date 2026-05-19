import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { admins } from "./admins";

// Empty in Phase E; Phase G+ populates for B2B / enterprise relationships.
export const institutionAccounts = pgTable("institution_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  industry: text("industry"),
  primary_contact_id: uuid("primary_contact_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  // Account manager is an admin (per D-078 separated admins entity).
  account_manager_id: uuid("account_manager_id").references(() => admins.id, {
    onDelete: "set null",
  }),
  custom_terms: jsonb("custom_terms"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InstitutionAccount = typeof institutionAccounts.$inferSelect;
export type NewInstitutionAccount = typeof institutionAccounts.$inferInsert;
