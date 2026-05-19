import { pgTable, uuid, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./profiles";
import { reportTargetTypeEnum, reportStatusEnum } from "./enums";

// User-filed moderation reports against listings, users, or messages.
// Append-only from the user side (no reports_reporter_update RLS policy);
// admin transitions status / sets first_viewed_at / first_action_at /
// resolved_at exclusively.
//
// Rate limit: 1 report per (reporter, target_type, target_id) per 7 days.
// Enforced in the server action (D-070), NOT in schema — NOW() is
// non-IMMUTABLE and can't appear in a partial unique index predicate.
// The reports_reporter_target_idx composite index makes the lookup cheap.
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporter_id: uuid("reporter_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    target_type: reportTargetTypeEnum("target_type").notNull(),
    target_id: uuid("target_id").notNull(),
    reason: text("reason").notNull(),
    description: text("description"),
    status: reportStatusEnum("status").notNull().default("new"),
    case_id: uuid("case_id"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    first_viewed_at: timestamp("first_viewed_at", { withTimezone: true }),
    first_action_at: timestamp("first_action_at", { withTimezone: true }),
    resolved_at: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => ({
    descriptionLength: check(
      "reports_description_length",
      sql`${table.description} IS NULL OR char_length(${table.description}) <= 200`,
    ),
  }),
);

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
