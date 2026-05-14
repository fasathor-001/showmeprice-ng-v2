import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

// Forensic log of every privileged admin action.
export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor_id: uuid("actor_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  // Short label, e.g. "verify_business", "disable_profile", "promote_admin".
  action: text("action").notNull(),
  // Target reference (table:id or url).
  target: text("target").notNull(),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminAuditLogEntry = typeof adminAuditLog.$inferSelect;
