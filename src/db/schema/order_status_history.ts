import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { orders } from "./orders";
import { profiles } from "./profiles";

// Empty in Phase E; Phase G+ logs every order-status transition.
export const orderStatusHistory = pgTable("order_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  order_id: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  from_status: text("from_status"),
  to_status: text("to_status"),
  changed_by: uuid("changed_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  reason: text("reason"),
  changed_at: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OrderStatusHistoryEntry = typeof orderStatusHistory.$inferSelect;
export type NewOrderStatusHistoryEntry = typeof orderStatusHistory.$inferInsert;
