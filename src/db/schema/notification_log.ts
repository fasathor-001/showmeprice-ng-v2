import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { notificationEventEnum } from "./enums";

// Per-event per-channel delivery record. One row per channel per event
// (a single 'new_message' event can produce one in_app row + one email
// row + one sms row).
//
// Writes happen via service_role from the notification-dispatch system.
// User reads own rows for the in-app notification center. User UPDATE
// (notification_log_self_update RLS) is for marking read_at — app server
// action restricts which column gets written.
export const notificationLog = pgTable("notification_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").references(() => profiles.id),
  event_type: notificationEventEnum("event_type"),
  // 'in_app' | 'email' | 'sms' | 'push'
  channel: text("channel"),
  subject: text("subject"),
  body: text("body"),
  sent_at: timestamp("sent_at", { withTimezone: true }).defaultNow(),
  delivered_at: timestamp("delivered_at", { withTimezone: true }),
  read_at: timestamp("read_at", { withTimezone: true }),
  // Termii message ID, email provider message ID, etc. — cross-reference
  // back to the upstream delivery provider.
  provider_reference: text("provider_reference"),
});

export type NotificationLogEntry = typeof notificationLog.$inferSelect;
export type NewNotificationLogEntry = typeof notificationLog.$inferInsert;
