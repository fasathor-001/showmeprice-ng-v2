import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";

// Separated admin entity (Phase E §14 / D-078). Distinct from
// profiles.role = 'admin', which Phase E retains for is_admin(auth.uid())
// checks (D-081 defers admin-model unification to Phase F+).
//
// admins.id is the FK target for admin_action_log.admin_id,
// admin_emails.admin_id, institution_accounts.account_manager_id. The
// Postgres function is_admin() still consults profiles.role; this table
// is for tooling identity + account-manager assignments.
export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  full_name: text("full_name").notNull(),
  // Phase E: 'super_admin' only. Phase F+: 'moderator', 'support',
  // 'finance', 'verifier'.
  admin_role: text("admin_role").notNull().default("super_admin"),
  active: boolean("active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  last_login_at: timestamp("last_login_at", { withTimezone: true }),
});

export type Admin = typeof admins.$inferSelect;
export type NewAdmin = typeof admins.$inferInsert;
