import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  smallint,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { messages } from "./messages";

// Stage 2.C Commit 9 — TC-001 / K-045 image-message attachments.
// Path structure: message-images/{conversation_id}/{message_id}/{position}-{ts}.jpg
// — see migrations/E.2.9.0-message-images.sql.
export const messageImages = pgTable(
  "message_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    message_id: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    storage_path: text("storage_path").notNull(),
    position: smallint("position").notNull(),
    width: integer("width"),
    height: integer("height"),
    byte_size: integer("byte_size"),
    mime_type: text("mime_type"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    messagePositionUnique: uniqueIndex(
      "message_images_message_position_unique",
    ).on(t.message_id, t.position),
    positionCheck: check(
      "message_images_position_check",
      sql`${t.position} BETWEEN 0 AND 2`,
    ),
  }),
);

export type MessageImage = typeof messageImages.$inferSelect;
