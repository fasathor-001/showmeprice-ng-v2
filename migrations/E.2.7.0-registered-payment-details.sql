-- ============================================================
-- E.2.7.0-registered-payment-details.sql
-- Stage 2.B Commit 1.6 — D-120 (Registered Payment Details)
-- ============================================================
-- Track 2 of Commit 1.6. Adds:
--   1) seller_payout_accounts — one active payout per seller, profile-keyed
--      with optional business_id link (D-116 verification levels: most sellers
--      at MVP don't have a business record). Closes K-009 — supersedes the
--      legacy seller_verifications.bank_* placeholder columns.
--   2) payment_detail_shares — per-conversation, per-buyer share events with
--      encrypted snapshot at share time + supersession on account updates.
--
-- ENCRYPTION: account_number stored as base64(IV || ciphertext+tag) where
-- ciphertext is AES-256-GCM with a 256-bit key from the Cloudflare Pages env
-- var PAYMENT_DETAILS_ENCRYPTION_KEY. Encryption/decryption happens in
-- application code (Web Crypto API — Edge-runtime safe per D-019). DB stores
-- the ciphertext verbatim and has no ability to decrypt.
--
-- SNAPSHOT POLICY: payment_detail_shares.account_snapshot carries the
-- ciphertext verbatim (no decrypt/re-encrypt at share time). Snapshots stay
-- encrypted at rest.
--
-- PREREQUISITES enforced in application code (not RLS):
--   * Seller must have a row in seller_payout_accounts before sharing.
--   * Buyer must have a row in contact_reveals (D-113) for this (buyer, seller)
--     pair before the seller can share payment details.
--
-- EXECUTION: run §0 (read-only) + paste FIRST. Then §1 as ONE BEGIN..COMMIT
-- submission (no text selected; "No limit" toggled). Then §2 + paste.
-- ============================================================


-- ============================================================
-- SECTION 0 — PRE-FLIGHT (read-only; run + paste FIRST)
-- ============================================================

-- 0a. Confirm dependent tables exist with expected PKs.
SELECT table_name,
       (SELECT column_name FROM information_schema.key_column_usage k
        WHERE k.table_name = t.table_name AND k.constraint_name LIKE '%_pkey'
        LIMIT 1) AS pk_column
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'businesses', 'conversations', 'contact_reveals')
ORDER BY table_name;
-- Expected: 4 rows, each with pk_column = 'id'.

-- 0b. Confirm the new tables do NOT already exist.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('seller_payout_accounts', 'payment_detail_shares');
-- Expected on first run: 0 rows.

-- 0c. Verify auth.uid() is callable (used in RLS policies).
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'auth')
  AND proname = 'uid';
-- Expected: 1 row, args = '' (no args).

-- 0d. Sanity — confirm K-009 legacy banking columns on seller_verifications
-- still exist (they remain, holding "PENDING" placeholders, until a future
-- cleanup pass per K-009 option (b) — superseded by this migration's separate
-- seller_payout_accounts table).
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='seller_verifications'
  AND column_name IN ('bank_name','bank_account_number','bank_account_holder')
ORDER BY column_name;
-- Expected: 3 rows; columns remain NOT NULL with placeholder data. This
-- migration does NOT touch them. A future K-009-cleanup migration can drop or
-- nullify them once D-120 is in production use.


-- ============================================================
-- SECTION 1 — MIGRATION (one BEGIN..COMMIT submission)
-- ============================================================
BEGIN;

-- ---------- TABLE: seller_payout_accounts ----------------------------------

CREATE TABLE public.seller_payout_accounts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id                   uuid NOT NULL UNIQUE
                              REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id                 uuid
                              REFERENCES public.businesses(id) ON DELETE SET NULL,
  bank_name                   text NOT NULL CHECK (length(bank_name) BETWEEN 1 AND 200),
  account_number_encrypted    text NOT NULL CHECK (length(account_number_encrypted) BETWEEN 1 AND 2048),
  account_name                text NOT NULL CHECK (length(account_name) BETWEEN 1 AND 200),
  registered_at               timestamptz NOT NULL DEFAULT now(),
  last_changed_at             timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.seller_payout_accounts IS
  'D-120: one registered payout account per seller. Profile-keyed; business_id is informational at MVP. Closes K-009 by separating payout from identity verification.';
COMMENT ON COLUMN public.seller_payout_accounts.account_number_encrypted IS
  'Base64(IV || ciphertext+tag) — AES-256-GCM via Web Crypto. Key in PAYMENT_DETAILS_ENCRYPTION_KEY (Cloudflare env). DB cannot decrypt.';
COMMENT ON COLUMN public.seller_payout_accounts.business_id IS
  'Optional FK to businesses. NULL = personal-account payout. Set when seller chooses to associate payout with a business. Informational at MVP.';

CREATE INDEX seller_payout_accounts_business_idx
  ON public.seller_payout_accounts(business_id)
  WHERE business_id IS NOT NULL;

-- RLS — seller owns their row (SELECT/INSERT/UPDATE only; no DELETE policy).
ALTER TABLE public.seller_payout_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY seller_payout_accounts_self_select
  ON public.seller_payout_accounts FOR SELECT
  USING (seller_id = auth.uid());

CREATE POLICY seller_payout_accounts_self_insert
  ON public.seller_payout_accounts FOR INSERT
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY seller_payout_accounts_self_update
  ON public.seller_payout_accounts FOR UPDATE
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

-- ---------- TABLE: payment_detail_shares -----------------------------------

CREATE TABLE public.payment_detail_shares (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id             uuid NOT NULL
                              REFERENCES public.conversations(id) ON DELETE CASCADE,
  seller_id                   uuid NOT NULL
                              REFERENCES public.profiles(id) ON DELETE CASCADE,
  buyer_id                    uuid NOT NULL
                              REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- {bank_name, account_name, account_number_encrypted} — ciphertext verbatim.
  account_snapshot            jsonb NOT NULL,
  shared_at                   timestamptz NOT NULL DEFAULT now(),
  buyer_viewed_at             timestamptz,
  buyer_warning_accepted_at   timestamptz,
  superseded_at               timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_detail_shares_snapshot_shape
    CHECK (
      jsonb_typeof(account_snapshot) = 'object'
      AND account_snapshot ? 'bank_name'
      AND account_snapshot ? 'account_name'
      AND account_snapshot ? 'account_number_encrypted'
    )
);

COMMENT ON TABLE public.payment_detail_shares IS
  'D-120: per-conversation, per-buyer share events. account_snapshot is a JSONB capture of the registered account at share time (ciphertext kept encrypted at rest).';
COMMENT ON COLUMN public.payment_detail_shares.account_snapshot IS
  'jsonb {bank_name, account_name, account_number_encrypted}. account_number_encrypted is ciphertext (Base64 IV||CT||tag) — copied verbatim from seller_payout_accounts at share time.';
COMMENT ON COLUMN public.payment_detail_shares.superseded_at IS
  'Set when seller updates payout and re-shares. The active share for a conversation has superseded_at IS NULL.';

-- Active shares per conversation (the partial index that the
-- getPaymentDetailsForConversation lookup hits).
CREATE INDEX payment_detail_shares_active_per_conversation_idx
  ON public.payment_detail_shares(conversation_id)
  WHERE superseded_at IS NULL;

CREATE INDEX payment_detail_shares_buyer_idx
  ON public.payment_detail_shares(buyer_id);

CREATE INDEX payment_detail_shares_seller_idx
  ON public.payment_detail_shares(seller_id);

-- RLS — seller SELECTs their own shares; buyer SELECTs shares directed to them.
-- Only seller INSERTs (and only as themselves). Only buyer UPDATEs (and only
-- viewing/warning fields — application enforces field whitelist).
ALTER TABLE public.payment_detail_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_detail_shares_seller_select
  ON public.payment_detail_shares FOR SELECT
  USING (seller_id = auth.uid());

CREATE POLICY payment_detail_shares_buyer_select
  ON public.payment_detail_shares FOR SELECT
  USING (buyer_id = auth.uid());

CREATE POLICY payment_detail_shares_seller_insert
  ON public.payment_detail_shares FOR INSERT
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY payment_detail_shares_buyer_update
  ON public.payment_detail_shares FOR UPDATE
  USING (buyer_id = auth.uid())
  WITH CHECK (buyer_id = auth.uid());

-- Seller may UPDATE only to set superseded_at (re-share path). Restricted in
-- application code; RLS allows the seller to UPDATE their own rows so the
-- supersession write succeeds under the user's session.
CREATE POLICY payment_detail_shares_seller_update
  ON public.payment_detail_shares FOR UPDATE
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

-- ---------- §1 inline verification — assertions ROLLBACK on failure --------

DO $$
DECLARE
  payout_table_exists      BOOLEAN;
  shares_table_exists      BOOLEAN;
  payout_rls               BOOLEAN;
  shares_rls               BOOLEAN;
  payout_policy_count      INT;
  shares_policy_count      INT;
  shares_active_idx_exists BOOLEAN;
BEGIN
  -- Tables exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='seller_payout_accounts'
  ) INTO payout_table_exists;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='payment_detail_shares'
  ) INTO shares_table_exists;

  IF NOT payout_table_exists THEN RAISE EXCEPTION 'seller_payout_accounts table missing'; END IF;
  IF NOT shares_table_exists THEN RAISE EXCEPTION 'payment_detail_shares table missing'; END IF;

  -- RLS enabled
  SELECT relrowsecurity FROM pg_class WHERE oid = 'public.seller_payout_accounts'::regclass INTO payout_rls;
  SELECT relrowsecurity FROM pg_class WHERE oid = 'public.payment_detail_shares'::regclass INTO shares_rls;

  IF NOT payout_rls THEN RAISE EXCEPTION 'RLS not enabled on seller_payout_accounts'; END IF;
  IF NOT shares_rls THEN RAISE EXCEPTION 'RLS not enabled on payment_detail_shares'; END IF;

  -- Policy counts
  SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='seller_payout_accounts'
    INTO payout_policy_count;
  SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='payment_detail_shares'
    INTO shares_policy_count;

  IF payout_policy_count <> 3 THEN
    RAISE EXCEPTION 'seller_payout_accounts policy count = % (expected 3: self_select, self_insert, self_update)', payout_policy_count;
  END IF;
  IF shares_policy_count <> 5 THEN
    RAISE EXCEPTION 'payment_detail_shares policy count = % (expected 5: seller_select, buyer_select, seller_insert, buyer_update, seller_update)', shares_policy_count;
  END IF;

  -- Partial index for active shares present
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='payment_detail_shares'
      AND indexname='payment_detail_shares_active_per_conversation_idx'
  ) INTO shares_active_idx_exists;
  IF NOT shares_active_idx_exists THEN
    RAISE EXCEPTION 'payment_detail_shares_active_per_conversation_idx missing';
  END IF;

  RAISE NOTICE 'E.2.7.0 verification passed: seller_payout_accounts + payment_detail_shares created with RLS (3 + 5 policies) and active-share partial index.';
END $$;

COMMIT;


-- ============================================================
-- SECTION 2 — PASTE-BACK VERIFICATION (read-only; run AFTER COMMIT)
-- ============================================================

-- 2a. Tables + RLS state
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('seller_payout_accounts', 'payment_detail_shares')
ORDER BY c.relname;
-- Expected: 2 rows, both rls_enabled = true.

-- 2b. Columns for seller_payout_accounts
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='seller_payout_accounts'
ORDER BY ordinal_position;
-- Expected 10 columns: id, seller_id, business_id, bank_name,
-- account_number_encrypted, account_name, registered_at, last_changed_at,
-- created_at, updated_at.

-- 2c. Columns for payment_detail_shares
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='payment_detail_shares'
ORDER BY ordinal_position;
-- Expected 10 columns: id, conversation_id, seller_id, buyer_id,
-- account_snapshot, shared_at, buyer_viewed_at, buyer_warning_accepted_at,
-- superseded_at, created_at.

-- 2d. RLS policy bodies
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('seller_payout_accounts', 'payment_detail_shares')
ORDER BY tablename, policyname;
-- Expected:
--   seller_payout_accounts:
--     self_select  | SELECT | seller_id = auth.uid() | (null)
--     self_insert  | INSERT | (null)                 | seller_id = auth.uid()
--     self_update  | UPDATE | seller_id = auth.uid() | seller_id = auth.uid()
--   payment_detail_shares:
--     buyer_select   | SELECT | buyer_id = auth.uid()  | (null)
--     buyer_update   | UPDATE | buyer_id = auth.uid()  | buyer_id = auth.uid()
--     seller_select  | SELECT | seller_id = auth.uid() | (null)
--     seller_insert  | INSERT | (null)                 | seller_id = auth.uid()
--     seller_update  | UPDATE | seller_id = auth.uid() | seller_id = auth.uid()

-- 2e. Foreign keys (no orphan _fkey names)
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid IN ('public.seller_payout_accounts'::regclass,
                   'public.payment_detail_shares'::regclass)
  AND contype = 'f'
ORDER BY conname;
-- Expected:
--   payment_detail_shares_buyer_id_fkey
--   payment_detail_shares_conversation_id_fkey
--   payment_detail_shares_seller_id_fkey
--   seller_payout_accounts_business_id_fkey
--   seller_payout_accounts_seller_id_fkey

-- 2f. Indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND tablename IN ('seller_payout_accounts', 'payment_detail_shares')
ORDER BY tablename, indexname;
-- Expected (5 total):
--   seller_payout_accounts_pkey                                (PK)
--   seller_payout_accounts_seller_id_key                       (UNIQUE)
--   seller_payout_accounts_business_idx                        (partial)
--   payment_detail_shares_pkey                                 (PK)
--   payment_detail_shares_active_per_conversation_idx          (partial, WHERE superseded_at IS NULL)
--   payment_detail_shares_buyer_idx
--   payment_detail_shares_seller_idx

-- ============================================================
-- END OF E.2.7.0
-- ============================================================
