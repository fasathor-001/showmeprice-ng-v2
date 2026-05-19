import { pgTable, uuid, boolean, primaryKey } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { notificationEventEnum } from "./enums";

// One row per (user, event_type). Seeded by the
// profiles_seed_notification_preferences trigger on profile INSERT
// (E.1.5) with defaults: in_app=true, email=true, sms=false, push=false.
// Existing profiles were backfilled in E.1.5 with the same defaults
// (active-only, 11 profiles × 13 events = 143 rows).
//
// SMS=false by default even for Pro buyers — Pro buyers opt in via
// the preferences UI; never seeded as true (cost control + D-064).
// Push=false stays until Phase F+ ships browser push.
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    event_type: notificationEventEnum("event_type").notNull(),
    in_app_enabled: boolean("in_app_enabled").default(true),
    email_enabled: boolean("email_enabled").default(true),
    sms_enabled: boolean("sms_enabled").default(false),
    push_enabled: boolean("push_enabled").default(false),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.user_id, table.event_type] }),
  }),
);

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;
