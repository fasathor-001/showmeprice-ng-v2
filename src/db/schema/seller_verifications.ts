import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { profiles } from "./profiles";
import { verificationStatusEnum } from "./enums";

// Audit trail of verification submissions. businesses.verification_status
// holds the current state; this table holds every submission.
export const sellerVerifications = pgTable("seller_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  business_id: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  id_document_path: text("id_document_path").notNull(),
  secondary_document_path: text("secondary_document_path"),
  bank_account_number: text("bank_account_number").notNull(),
  bank_name: text("bank_name").notNull(),
  bank_account_holder: text("bank_account_holder").notNull(),
  status: verificationStatusEnum("status").notNull().default("pending"),
  reviewed_by: uuid("reviewed_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
  rejection_reason: text("rejection_reason"),
  submitted_at: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SellerVerification = typeof sellerVerifications.$inferSelect;
