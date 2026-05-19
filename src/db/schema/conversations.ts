import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { products } from "./products";

// WhatsApp-style chat between buyer and seller about a specific listing.
// One conversation per (buyer, seller, listing) for the canonical
// buyer↔seller flow — enforced by a partial unique index on those
// three columns WHERE conversation_type = 'buyer_seller'. Partial-index
// pattern leaves room for future conversation_type values
// ('admin_user' Phase F+, 'seller_buyer_fulfillment' Phase G+) without
// dedup conflicts.
//
// Only buyers can initiate (spec §7). Enforced via
// conversations_buyer_insert RLS policy.
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  buyer_id: uuid("buyer_id")
    .notNull()
    .references(() => profiles.id),
  seller_id: uuid("seller_id")
    .notNull()
    .references(() => profiles.id),
  listing_id: uuid("listing_id")
    .notNull()
    .references(() => products.id),
  // 'buyer_seller' (Phase E) / 'admin_user' (Phase F+) / 'seller_buyer_fulfillment' (Phase G+)
  conversation_type: text("conversation_type").notNull().default("buyer_seller"),
  // 'active' / 'archived' / 'listing_sold' / 'listing_deleted'
  status: text("status").default("active"),
  last_message_at: timestamp("last_message_at", { withTimezone: true }),
  last_message_type: text("last_message_type"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
