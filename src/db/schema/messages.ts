import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { conversations } from "./conversations";

// In-conversation messages. Phase E ships 'text' + 'image' types;
// Phase F+ adds 'voice_note', 'offer', 'system'.
//
// Read pattern (messages_party_read RLS): both buyer and seller can
// SELECT. Write pattern (messages_sender_insert): sender_id must
// match auth.uid() AND the sender must be a party to the conversation.
// Update pattern (messages_party_update): either party can UPDATE —
// the app server action restricts which column actually gets written
// (only read_at, when recipient opens the conversation).
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversation_id: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  sender_id: uuid("sender_id")
    .notNull()
    .references(() => profiles.id),
  // 'text' (Phase E) / 'image' (Phase E) / 'voice_note' (Phase F+) /
  // 'offer' (Phase F+) / 'system' (Phase F+ admin messages)
  message_type: text("message_type").notNull().default("text"),
  content: text("content"),
  // Voice note duration, offer amount, image dimensions, etc.
  metadata: jsonb("metadata").default({}),
  // Supabase Storage URL for image attachments.
  attachment_url: text("attachment_url"),
  // Null until recipient reads.
  read_at: timestamp("read_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
