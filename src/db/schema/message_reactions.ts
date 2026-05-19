import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { messages } from "./messages";
import { profiles } from "./profiles";

// Empty in Phase E; Phase F+ ships emoji reactions on messages.
export const messageReactions = pgTable(
  "message_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    message_id: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // 'thumbs_up' / 'thumbs_down' / ... — open taxonomy until Phase F+ locks it.
    reaction: text("reaction").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    messageUserReactionUnique: unique(
      "message_reactions_message_id_user_id_reaction_key",
    ).on(table.message_id, table.user_id, table.reaction),
  }),
);

export type MessageReaction = typeof messageReactions.$inferSelect;
export type NewMessageReaction = typeof messageReactions.$inferInsert;
