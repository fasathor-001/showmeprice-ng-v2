import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { admins } from "./admins";

// Phase E moderation audit log. Replaces Phase A's admin_audit_log
// (dropped E.1.3.1, D-081). Structured target reference + case_id for
// Phase F+ case clustering.
//
// Writes happen via authenticated admin server actions (RLS:
// admin_action_log_admin_all bound to is_admin(auth.uid())).
export const adminActionLog = pgTable("admin_action_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  admin_id: uuid("admin_id")
    .notNull()
    .references(() => admins.id),
  // 'listing' / 'user' / 'message' / 'report' / 'verification' / 'subscription'
  target_type: text("target_type").notNull(),
  target_id: uuid("target_id").notNull(),
  // 'dismiss_report' / 'warn_user' / 'hide_listing' / 'suspend_user' /
  // 'ban_user' / 'verify_seller' / 'reject_verification' / 'refund' /
  // 'email_sent' / ...
  action: text("action").notNull(),
  reason: text("reason"),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  case_id: uuid("case_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminActionLogEntry = typeof adminActionLog.$inferSelect;
export type NewAdminActionLogEntry = typeof adminActionLog.$inferInsert;
