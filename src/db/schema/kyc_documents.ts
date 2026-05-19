import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

// Empty in Phase E; column shape PROVISIONAL per D-075.
//
// Stage 2 NIN integration (Korapay Identity per D-074) may ALTER this
// table with additional columns based on the actual Korapay response
// shape — confidence scores, biometric flags, full provider response
// JSON envelope. Per D-075 PII discipline note, raw provider response
// data must NOT be exposed via self-read RLS; the three patterns to
// choose between at Stage 2 are split tables / views / column-level RLS.
//
// Phase E uses: nothing. Schema scaffolded so Stage 2 doesn't require a
// CREATE TABLE migration alongside the integration work.
export const kycDocuments = pgTable("kyc_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  // Stage 2 limits to 'nin'; Phase F+ adds 'bvn' (D-076).
  document_type: text("document_type"),
  document_reference: text("document_reference"),
  verification_status: text("verification_status"),
  verified_at: timestamp("verified_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type KycDocument = typeof kycDocuments.$inferSelect;
export type NewKycDocument = typeof kycDocuments.$inferInsert;
