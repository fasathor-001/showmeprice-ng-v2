import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

// Append-only audit of admin actions on profile fields (E.2.15.0, Stage 1
// admin tools Step 1). Mirrors admin_role_changes (E.2.2.0) shape — separate
// table from admin_action_log to avoid the `admins`-table dependency that
// admin-model unification (D-081) defers.
//
// Written ONLY by SECURITY DEFINER RPCs (admin_change_user_phone,
// admin_change_user_location — Step 2) or service_role directly. RLS allows
// admin SELECT only; no INSERT/UPDATE/DELETE policy.
//
// action CHECK (IN 'phone_changed' | 'location_changed') lives in the SQL
// migration. Future stages extend the CHECK to add 'email_changed',
// 'account_suspended', 'account_deleted'. previous_value / new_value are
// free-form text (nullable for the future account_deleted case); reason is
// NOT NULL (length checks live in RPC bodies, mirroring E.2.2.0).
export const profileAdminChanges = pgTable("profile_admin_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Subject of the action. RESTRICT: audit must survive any future delete flow.
  target_user_id: uuid("target_user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  // Acting admin. SET NULL: row survives if the admin's profile is removed.
  granter_id: uuid("granter_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  previous_value: text("previous_value"),
  new_value: text("new_value"),
  reason: text("reason").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ProfileAdminChange = typeof profileAdminChanges.$inferSelect;
export type NewProfileAdminChange = typeof profileAdminChanges.$inferInsert;
