import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { userTypeEnum, userRoleEnum } from "./enums";

// D-004 / D-005: user_type is canonical; role is admin-only.
// profiles.id mirrors auth.users.id (cross-schema FK in migration SQL).
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  display_name: text("display_name").notNull(),
  handle: text("handle").unique(),
  // D-009: E.164 without "+".
  whatsapp_number: text("whatsapp_number").notNull(),
  user_type: userTypeEnum("user_type").notNull().default("buyer"),
  role: userRoleEnum("role"),
  avatar_path: text("avatar_path"),
  is_disabled: boolean("is_disabled").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
