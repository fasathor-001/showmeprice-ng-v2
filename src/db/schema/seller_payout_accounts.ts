import { pgTable, uuid, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./profiles";
import { businesses } from "./businesses";

// D-120: seller's registered payout account. One active row per seller
// (UNIQUE on seller_id). Profile-keyed because most ShowMePrice sellers at MVP
// don't have a business record (D-116 levels 1-2). business_id is optional
// and informational only at MVP — labels which business this payout is
// associated with when the seller upgrades to L3 (Business Verified).
//
// Supersedes K-009's seller_verifications.bank_* placeholder columns
// (those remain in production until a future cleanup migration drops them).
//
// account_number_encrypted holds AES-256-GCM ciphertext (Base64 of
// IV || ciphertext || auth tag). Encryption key in Cloudflare env var
// PAYMENT_DETAILS_ENCRYPTION_KEY. Implementation in src/lib/crypto/
// payment-details.ts (Web Crypto — Edge runtime safe per D-019).
//
// RLS — seller owns their row (SELECT/INSERT/UPDATE). No DELETE policy
// (re-share supersedes via payment_detail_shares; payout row itself is
// updated in place).
export const sellerPayoutAccounts = pgTable(
  "seller_payout_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seller_id: uuid("seller_id")
      .notNull()
      .unique()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // NULLABLE FK. ON DELETE SET NULL — losing the business shouldn't
    // delete the seller's payout account.
    business_id: uuid("business_id").references(() => businesses.id, {
      onDelete: "set null",
    }),
    bank_name: text("bank_name").notNull(),
    // Base64(IV || ciphertext || tag) — Web Crypto AES-256-GCM. The DB has
    // no ability to decrypt — only the application with the env-var key.
    account_number_encrypted: text("account_number_encrypted").notNull(),
    account_name: text("account_name").notNull(),
    registered_at: timestamp("registered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    last_changed_at: timestamp("last_changed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    bankNameLen: check(
      "seller_payout_accounts_bank_name_check",
      sql`length(${t.bank_name}) BETWEEN 1 AND 200`,
    ),
    accountNumberLen: check(
      "seller_payout_accounts_account_number_encrypted_check",
      sql`length(${t.account_number_encrypted}) BETWEEN 1 AND 2048`,
    ),
    accountNameLen: check(
      "seller_payout_accounts_account_name_check",
      sql`length(${t.account_name}) BETWEEN 1 AND 200`,
    ),
  }),
);

export type SellerPayoutAccount = typeof sellerPayoutAccounts.$inferSelect;
export type NewSellerPayoutAccount = typeof sellerPayoutAccounts.$inferInsert;
