import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { profiles } from "./profiles";
import { nigerianStates } from "./nigerian_states";
import { verificationStatusEnum, idDocumentTypeEnum } from "./enums";

// Audit trail of verification submissions. businesses.verification_status
// holds the current state; this table holds every submission.
//
// Phase A shape: banking columns (id_document_path, bank_*) for payout verification.
// Phase C.5 P.1 ALTER: identity columns (legal_*, address_*, nin, selfie_path)
// for the seller verification gate. Banking columns stay nullable in spirit but
// remain NOT NULL in the live DB — Phase C.5 inserts placeholder "PENDING" until
// Phase G builds the payout flow (tracked as K-009).
export const sellerVerifications = pgTable("seller_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  business_id: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),

  // Banking (Phase A; kept for Phase G payout use)
  id_document_path: text("id_document_path").notNull(),
  secondary_document_path: text("secondary_document_path"),
  bank_account_number: text("bank_account_number").notNull(),
  bank_name: text("bank_name").notNull(),
  bank_account_holder: text("bank_account_holder").notNull(),

  // Identity (Phase C.5 P.1 additions)
  legal_first_name: text("legal_first_name"),
  legal_last_name: text("legal_last_name"),
  address_line_1: text("address_line_1"),
  address_line_2: text("address_line_2"),
  city: text("city"),
  address_state_id: uuid("address_state_id").references(() => nigerianStates.id),
  nin: text("nin"),
  id_document_type: idDocumentTypeEnum("id_document_type"),
  selfie_path: text("selfie_path"),

  // Status + review
  status: verificationStatusEnum("status").notNull().default("pending"),
  reviewed_by: uuid("reviewed_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
  rejection_reason: text("rejection_reason"),
  submitted_at: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SellerVerification = typeof sellerVerifications.$inferSelect;
