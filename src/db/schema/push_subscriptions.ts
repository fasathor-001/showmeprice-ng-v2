import { pgTable, uuid, text, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

// Empty in Phase E; Phase F+ populates for browser push notifications.
// Standard Web Push API shape — endpoint URL + the auth/p256dh keys
// needed to encrypt payloads.
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    keys: jsonb("keys"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userEndpointUnique: unique("push_subscriptions_user_id_endpoint_key").on(
      table.user_id,
      table.endpoint,
    ),
  }),
);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
