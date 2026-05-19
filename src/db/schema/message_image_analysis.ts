import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { messages } from "./messages";

// Empty in Phase E; Phase G+ populates for OCR analysis of image
// attachments in messages (detects phone numbers / bank accounts in
// shared images to catch off-platform-routing attempts).
export const messageImageAnalysis = pgTable("message_image_analysis", {
  id: uuid("id").primaryKey().defaultRandom(),
  message_id: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  ocr_text: text("ocr_text"),
  detected_phone_numbers: text("detected_phone_numbers").array(),
  detected_bank_accounts: text("detected_bank_accounts").array(),
  analysis_status: text("analysis_status"),
  analyzed_at: timestamp("analyzed_at", { withTimezone: true }),
});

export type MessageImageAnalysis = typeof messageImageAnalysis.$inferSelect;
export type NewMessageImageAnalysis = typeof messageImageAnalysis.$inferInsert;
