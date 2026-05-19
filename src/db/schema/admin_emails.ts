import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { admins } from "./admins";
import { profiles } from "./profiles";

// Outbound email log for admin-to-user communications. Phase E ships
// email channel only ('email' default); Phase F+ extends to 'in_app'
// and 'sms'.
//
// Composed via admin email templates ("Your listing was reported and
// reviewed", "Your account is suspended", etc.) — admin can edit
// before sending, full body logged here for audit.
export const adminEmails = pgTable("admin_emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  admin_id: uuid("admin_id").references(() => admins.id),
  recipient_user_id: uuid("recipient_user_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  // Phase E: 'email'. Phase F+: 'in_app' / 'sms'.
  channel: text("channel").notNull().default("email"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  case_id: uuid("case_id"),
  sent_at: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminEmail = typeof adminEmails.$inferSelect;
export type NewAdminEmail = typeof adminEmails.$inferInsert;
