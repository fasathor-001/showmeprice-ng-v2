import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

// Append-only audit of admin role grants/revokes (D-105, Stage 2.A.1).
// Deployed in migration E.2.2.0 (commit 80e4913). Written ONLY by the
// service_role-locked SECURITY DEFINER functions grant_admin_role /
// revoke_admin_role (triple-REVOKE'd per the E.2.1.1 lockdown principle) or
// service_role directly — there is no API-level INSERT/UPDATE/DELETE policy.
// RLS: admins SELECT only.
//
// action CHECK (IN 'granted' | 'revoked' | 'bootstrap') lives in the SQL
// migration, not encoded here — mirror convention matches siblings, which keep
// CHECKs in raw SQL. 'bootstrap' = first admin via ADMIN_BOOTSTRAP_EMAIL
// (granter_id NULL); 'granted' / 'revoked' = delegated by an existing admin.
export const adminRoleChanges = pgTable("admin_role_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  target_user_id: uuid("target_user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  // NULL for bootstrap (no granter).
  granter_id: uuid("granter_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  reason: text("reason"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AdminRoleChange = typeof adminRoleChanges.$inferSelect;
export type NewAdminRoleChange = typeof adminRoleChanges.$inferInsert;
