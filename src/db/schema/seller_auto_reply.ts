import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

// Empty in Phase E; Phase F+ ships as Pro seller feature
// ("Thanks for your message — I'll respond within an hour").
export const sellerAutoReply = pgTable("seller_auto_reply", {
  id: uuid("id").primaryKey().defaultRandom(),
  seller_id: uuid("seller_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  // 'first_message' / 'after_hours' / 'always'
  trigger_type: text("trigger_type"),
  message_template: text("message_template"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SellerAutoReply = typeof sellerAutoReply.$inferSelect;
export type NewSellerAutoReply = typeof sellerAutoReply.$inferInsert;
