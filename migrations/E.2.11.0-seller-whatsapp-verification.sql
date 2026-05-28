-- ============================================================
-- E.2.11.0-seller-whatsapp-verification.sql
-- Stage A — DB foundation for seller-WhatsApp inline OTP verification
-- ============================================================
--
-- Three additive changes, one transaction:
--   1. ADD phone_verifications.purpose (NOT NULL DEFAULT 'profile_phone',
--      CHECK in {'profile_phone','seller_whatsapp'}). Default ensures existing
--      rows backfill to 'profile_phone' atomically — they're all the existing
--      profile-phone-verify flow.
--   2. ADD businesses.seller_whatsapp (text, nullable, CHECK NULL or
--      ^234\d{10}$) + businesses.seller_whatsapp_verified_at (timestamptz,
--      nullable). Non-null verified_at = "this number was OTP-proven at that
--      time." No boolean — the timestamp is both flag and audit.
--   3. CREATE FUNCTION mark_seller_whatsapp_verified — sibling to
--      mark_phone_verified, atomic across phone_verifications + businesses.
--      DOES NOT touch profiles.verification_status, profiles.phone, or
--      profiles.auth_providers. SECURITY DEFINER, search_path pinned,
--      triple-REVOKE + service_role-only EXECUTE.
--
-- Design notes (mirroring E.2.1.1 conventions):
--   * caller validation   — row.user_id must equal p_user_id (defense in depth)
--   * purpose validation  — row.purpose must equal 'seller_whatsapp' (this RPC
--                           refuses to consume profile-phone-purpose rows; the
--                           existing mark_phone_verified owns those)
--   * single-consume race — proceeds only if consumed_at IS NULL, under FOR UPDATE
--   * phone provenance    — the stored number is read from v_row.phone (the
--                           number the user provably received the OTP on);
--                           the RPC NEVER takes a phone as a parameter
--   * business identity   — businesses.owner_id is UNIQUE; the RPC looks up
--                           the business via owner_id = p_user_id. No p_business_id
--                           parameter needed.
--
-- Why the existing OTP flow stays untouched:
--   The parallel/additive design (per the OTP-reuse investigation) means
--   sendPhoneOtpAction / verifyPhoneOtpAction / mark_phone_verified continue
--   to behave exactly as today. Existing phone_verifications rows get
--   purpose='profile_phone' via the default; nothing about the profile-phone
--   verify path changes. Seller-WhatsApp adds new entry points + this sibling
--   RPC, on the same table + provider infrastructure.
--
-- EXECUTION: run §0 (paste), then §1 as one BEGIN..COMMIT submission (no
-- text selected), then §2 (paste). DB-first — Stage B (action code) lands
-- only after §2 is green and the Drizzle mirror is committed.
--
-- ============================================================


-- ============================================================
-- SECTION 0 — PRE-FLIGHT (read-only; run + paste first)
-- ============================================================
-- Expect:
--   phone_verifications_exists           = true
--   purpose_col_exists                   = false
--   businesses_exists                    = true
--   seller_whatsapp_col_exists           = false
--   seller_whatsapp_verified_at_col_exists = false
--   function_exists                      = false
--   existing_rows_count                  = <any non-negative integer>
--     (purpose's default makes the backfill safe regardless of count)
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='phone_verifications') AS phone_verifications_exists,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='phone_verifications'
            AND column_name='purpose')                                       AS purpose_col_exists,
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='businesses')           AS businesses_exists,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='businesses'
            AND column_name='seller_whatsapp')                               AS seller_whatsapp_col_exists,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='businesses'
            AND column_name='seller_whatsapp_verified_at')                   AS seller_whatsapp_verified_at_col_exists,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='mark_seller_whatsapp_verified') AS function_exists,
  (SELECT count(*) FROM public.phone_verifications)                          AS existing_rows_count;


-- ============================================================
-- SECTION 1 — MIGRATION (one transaction)
-- ============================================================
BEGIN;

-- ----- 1. phone_verifications.purpose -----
-- NOT NULL with DEFAULT 'profile_phone' backfills every existing row
-- to the profile-phone meaning atomically. Existing OTP flow is unchanged
-- because it never reads/writes this column; the new seller-WhatsApp
-- entry points will write 'seller_whatsapp' explicitly.
ALTER TABLE public.phone_verifications
  ADD COLUMN purpose text NOT NULL DEFAULT 'profile_phone';

ALTER TABLE public.phone_verifications
  ADD CONSTRAINT phone_verifications_purpose_check
  CHECK (purpose IN ('profile_phone', 'seller_whatsapp'));

-- New verify-path lookup index: newest unconsumed for (user, purpose).
-- Partial on consumed_at IS NULL because the verify path always filters there
-- and consumed rows accumulate. The pre-existing (user_id, created_at DESC)
-- index is retained — it serves other potential reads and the planner can
-- still use it as a fallback. The new partial index is small and targeted.
CREATE INDEX phone_verifications_user_purpose_unconsumed_idx
  ON public.phone_verifications (user_id, purpose, created_at DESC)
  WHERE consumed_at IS NULL;

-- ----- 2. businesses.seller_whatsapp + seller_whatsapp_verified_at -----
-- Nullable. NULL seller_whatsapp = seller chose "use my verified profile phone"
-- (fallback at reveal time is profile.phone). Non-null = a specific number the
-- seller designated. Non-null seller_whatsapp_verified_at = that number was
-- OTP-proven at that timestamp. The two columns move together via the RPC
-- below — never via direct UPDATEs from application code, so the invariant
-- "verified_at is non-null IFF the current seller_whatsapp value was the
-- value that was verified" is preserved through the RPC's atomic write.
ALTER TABLE public.businesses
  ADD COLUMN seller_whatsapp text;

ALTER TABLE public.businesses
  ADD COLUMN seller_whatsapp_verified_at timestamptz;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_seller_whatsapp_format_check
  CHECK (seller_whatsapp IS NULL OR seller_whatsapp ~ '^234\d{10}$');

-- ----- 3. mark_seller_whatsapp_verified RPC -----
-- Sibling to mark_phone_verified. Atomic verify-success across
-- phone_verifications + businesses, with strict guards.
CREATE OR REPLACE FUNCTION public.mark_seller_whatsapp_verified(
  p_verification_id uuid,
  p_user_id         uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row      public.phone_verifications%ROWTYPE;
  v_business_id uuid;
BEGIN
  -- Lock the verification row to serialize against concurrent verify attempts.
  SELECT * INTO v_row
  FROM public.phone_verifications
  WHERE id = p_verification_id
  FOR UPDATE;

  -- No such row.
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Caller validation (defense in depth): the row must belong to the user the
  -- action authenticated. The action already checks this; the function must
  -- not trust its caller blindly.
  IF v_row.user_id <> p_user_id THEN
    RETURN false;
  END IF;

  -- Purpose validation: this RPC consumes ONLY seller_whatsapp-purpose rows.
  -- A profile-phone-purpose row is mark_phone_verified's responsibility;
  -- crossing the streams would mean (a) granting profile-level phone_verified
  -- via the wrong path, or (b) overwriting the seller's WhatsApp with their
  -- profile phone. Refuse.
  IF v_row.purpose <> 'seller_whatsapp' THEN
    RETURN false;
  END IF;

  -- Single-consume race guard: if already consumed, do nothing.
  IF v_row.consumed_at IS NOT NULL THEN
    RETURN false;
  END IF;

  -- Locate the seller's business. owner_id is UNIQUE on businesses, so this
  -- resolves to at most one row. If the user has no business yet, refuse —
  -- the caller (becomeSellerAction) should always create the business first
  -- OR call this RPC after the business is created.
  SELECT id INTO v_business_id
  FROM public.businesses
  WHERE owner_id = p_user_id;

  IF v_business_id IS NULL THEN
    RETURN false;
  END IF;

  -- Consume the OTP row.
  UPDATE public.phone_verifications
  SET consumed_at = now()
  WHERE id = p_verification_id;

  -- Write the verified number + timestamp to the seller's business. The
  -- number written is v_row.phone — the number the OTP was provably
  -- delivered to and the user provably received. Never a parameter.
  --
  -- This UPDATE touches seller_whatsapp + seller_whatsapp_verified_at +
  -- (implicitly) updated_at via set_updated_at trigger. It does NOT touch
  -- verification_status, so businesses_freeze_verification (BEFORE UPDATE)
  -- does not raise.
  UPDATE public.businesses
  SET
    seller_whatsapp             = v_row.phone,
    seller_whatsapp_verified_at = now()
  WHERE id = v_business_id;

  RETURN true;
END;
$fn$;

-- Lock down EXECUTE: only the service role may call this. Same pattern as
-- mark_phone_verified — anon/authenticated/PUBLIC all REVOKE'd because
-- Supabase auto-grants on creation.
REVOKE EXECUTE ON FUNCTION public.mark_seller_whatsapp_verified(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_seller_whatsapp_verified(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_seller_whatsapp_verified(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_seller_whatsapp_verified(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- SECTION 2 — VERIFICATION (read-only; run + paste after migrating)
-- ============================================================

-- 2a. phone_verifications.purpose column: text, NOT NULL, default 'profile_phone'.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='phone_verifications'
  AND column_name='purpose';

-- 2b. phone_verifications.purpose CHECK constraint present.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid='public.phone_verifications'::regclass
  AND conname='phone_verifications_purpose_check';

-- 2c. Existing phone_verifications rows backfilled to 'profile_phone'.
--     Expect: every existing row purpose='profile_phone', zero 'seller_whatsapp'
--     rows (none have been written yet).
SELECT purpose, count(*) AS rows
FROM public.phone_verifications
GROUP BY purpose
ORDER BY purpose;

-- 2d. New partial index present.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename='phone_verifications'
  AND indexname='phone_verifications_user_purpose_unconsumed_idx';

-- 2e. businesses.seller_whatsapp + seller_whatsapp_verified_at present + nullable.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='businesses'
  AND column_name IN ('seller_whatsapp', 'seller_whatsapp_verified_at')
ORDER BY column_name;

-- 2f. businesses.seller_whatsapp CHECK constraint present with NULL-or-E.164.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid='public.businesses'::regclass
  AND conname='businesses_seller_whatsapp_format_check';

-- 2g. mark_seller_whatsapp_verified function: SECURITY DEFINER, search_path pinned.
SELECT
  p.proname,
  p.prosecdef AS security_definer,        -- expect true
  p.proconfig AS config,                   -- expect {search_path=public}
  pg_get_function_identity_arguments(p.oid) AS args  -- expect "p_verification_id uuid, p_user_id uuid"
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='mark_seller_whatsapp_verified';

-- 2h. EXECUTE granted to service_role, NOT to anon/authenticated/PUBLIC.
--     PASS = service_role present (owner role e.g. postgres may also appear)
--     AND anon/authenticated/PUBLIC all ABSENT.
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema='public' AND routine_name='mark_seller_whatsapp_verified'
ORDER BY grantee;

-- ============================================================
-- END OF E.2.11.0
-- ============================================================
