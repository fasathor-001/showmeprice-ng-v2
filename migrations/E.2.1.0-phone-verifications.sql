-- ============================================================
-- E.2.1.0-phone-verifications.sql
-- Stage 2.A — phone OTP verification (we-own-lifecycle model)
-- ============================================================
--
-- Creates the phone_verifications table that backs sendPhoneOtpAction /
-- verifyPhoneOtpAction. We own the OTP lifecycle (Option 2, FINAL): the
-- provider only DELIVERS a code we generated; generation, hashing, expiry,
-- attempt-counting, and rate-limiting all live here + in the server action.
--
-- ACCESS MODEL: RLS enabled, ZERO policies. The table is never read or
-- written by the browser (anon/authenticated PostgREST) — only by server
-- actions through the service-role client (createAdminClient, bypasses RLS).
-- This keeps code_hash + attempts_made entirely server-side.
--
-- RATE LIMITS enforced by the server action by COUNTing rows:
--   * 3 sends / phone / hour      (phone + created_at index)
--   * 10 sends / IP / hour        (request_ip_hash + created_at index)
--   * 5 verify attempts / OTP     (attempts_made column, capped per row)
--   * 10-minute OTP TTL           (expires_at)
--
-- EXECUTION DISCIPLINE (Supabase SQL Editor):
--   * Run PRE-FLIGHT (Section 0) FIRST, paste output. Proceed only if it
--     confirms the table does NOT already exist and profiles.id is uuid.
--   * Then run the MIGRATION (Section 1) as one BEGIN..COMMIT submission;
--     confirm no text is selected before Run.
--   * Then run VERIFICATION (Section 2), paste output for review.
--
-- ============================================================


-- ============================================================
-- SECTION 0 — PRE-FLIGHT (read-only; run + paste before migrating)
-- ============================================================
-- Expect:
--   row 1: phone_verifications_exists = false
--   row 2: profiles_id_type = 'uuid'
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'phone_verifications'
  ) AS phone_verifications_exists,
  (
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id'
  ) AS profiles_id_type;


-- ============================================================
-- SECTION 1 — MIGRATION (one transaction)
-- ============================================================
BEGIN;

CREATE TABLE public.phone_verifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL,
  -- Canonical NG number, E.164 without '+' (e.g. 2348012345678), produced by
  -- normalizeNigerianWhatsApp(). Matches profiles.phone storage format.
  phone         text        NOT NULL,
  -- SHA-256 hex of the OTP code. Plaintext code is NEVER stored.
  code_hash     text        NOT NULL,
  -- Delivery channel. SMS ships in Stage 2.A; 'whatsapp' reserved (interface
  -- models it, path unexercised for now).
  channel       text        NOT NULL DEFAULT 'sms',
  -- Per-IP rate limiting, stored as SHA-256(OTP_IP_HASH_SALT + raw_ip) — a
  -- SALTED HASH, never the raw IP. NDPR treats IP as PII; hashing eliminates
  -- that exposure while preserving equality-based rate-limit matching (same IP
  -- → same hash). The salt (OTP_IP_HASH_SALT) is a stable 32+ byte app secret
  -- that MUST NOT be rotated — rotating it would orphan all prior hashes and
  -- silently reset every per-IP counter. Nullable: the edge runtime may not
  -- always resolve a client IP.
  request_ip_hash text,
  expires_at    timestamptz NOT NULL,
  attempts_made integer     NOT NULL DEFAULT 0,
  -- Set when an OTP is successfully verified OR explicitly invalidated; a
  -- consumed row is never re-usable.
  consumed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- Drizzle-canonical FK name (matches the schema file added in Step 2).
  CONSTRAINT phone_verifications_user_id_profiles_id_fk
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT phone_verifications_channel_check
    CHECK (channel IN ('sms', 'whatsapp')),
  CONSTRAINT phone_verifications_attempts_nonneg_check
    CHECK (attempts_made >= 0)
);

-- Rate-limit + lookup indexes.
-- Per-phone send count in the trailing hour.
CREATE INDEX phone_verifications_phone_created_idx
  ON public.phone_verifications (phone, created_at);
-- Per-IP send count in the trailing hour (matched on the salted hash).
CREATE INDEX phone_verifications_request_ip_hash_created_idx
  ON public.phone_verifications (request_ip_hash, created_at);
-- Verify-path lookup: newest unconsumed row for a user.
CREATE INDEX phone_verifications_user_created_idx
  ON public.phone_verifications (user_id, created_at DESC);

-- RLS on, no policies — service-role-only access (see ACCESS MODEL above).
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;

-- Refresh PostgREST schema cache.
NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- SECTION 2 — VERIFICATION (read-only; run + paste after migrating)
-- ============================================================

-- 2a. Columns + types (expect 10 rows in this logical order).
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'phone_verifications'
ORDER BY ordinal_position;

-- 2b. FK exists with CASCADE; CHECK constraints present.
--     confdeltype 'c' = CASCADE.
SELECT conname, contype, confdeltype
FROM pg_constraint
WHERE conrelid = 'public.phone_verifications'::regclass
ORDER BY conname;

-- 2c. Indexes (expect the 3 created above + the PK index).
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'phone_verifications'
ORDER BY indexname;

-- 2d. RLS enabled (expect relrowsecurity = true) and ZERO policies
--     (expect policy_count = 0).
SELECT
  c.relrowsecurity AS rls_enabled,
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'phone_verifications') AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'phone_verifications';

-- ============================================================
-- END OF E.2.1.0
-- ============================================================
