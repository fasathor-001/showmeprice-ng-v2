import {
  pgTable,
  uuid,
  timestamp,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./profiles";

// User-to-user blocks (buyer ↔ seller). Self-serve from blocker's
// profile settings.
//
// Block enforcement:
//   - Blocker doesn't see blocked party in seller inboxes / search results
//   - Blocked party MUST NOT see the block row (one-sided read RLS —
//     blocks_blocker_read only, no blocks_blocked_read by design;
//     drives "blocker disappears from blocked user's inbox" behavior)
//   - Blocker can reverse (DELETE policy)
//
// Admin reads all blocks (blocks_admin_read) for fraud-pattern dashboard
// keyed on the blocks_blocked_count_idx aggregate.
export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blocker_id: uuid("blocker_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    blocked_id: uuid("blocked_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    case_id: uuid("case_id"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    blockerBlockedUnique: unique("blocks_blocker_id_blocked_id_key").on(
      table.blocker_id,
      table.blocked_id,
    ),
    noSelf: check("blocks_no_self", sql`${table.blocker_id} <> ${table.blocked_id}`),
  }),
);

export type Block = typeof blocks.$inferSelect;
export type NewBlock = typeof blocks.$inferInsert;
