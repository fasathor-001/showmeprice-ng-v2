-- ============================================================
-- E.2.1.1-phone-verifications-provider-and-verify-fn.sql
-- Stage 2.A — Step 3 DB prerequisites
-- ============================================================
--
-- Two changes, one transaction:
--   1. ADD phone_verifications.provider (NOT NULL, CHECK in {termii,arkesel}).
--      The sending vendor is recorded at send time (getOtpProvider().vendor)
--      and read back at verify time to tag profiles.auth_providers correctly
--      across a vendor swap (D2).
--   2. CREATE FUNCTION mark_phone_verified — atomic verify-success across two
--      tables (phone_verifications + profiles), which the supabase JS client
--      cannot do over PostgREST (D3). SECURITY DEFINER so the user cannot
--      self-grant 'phone_verified' through normal profiles RLS — only this
--      audited function can, and EXECUTE is restricted to service_role.
--
-- The function enforces internally:
--   * caller validation  — row.user_id must equal p_user_id (defense in depth)
--   * single-consume race — proceeds only if consumed_at IS NULL, under FOR UPDATE
--   * idempotent appends  — never duplicates 'phone_verified' / the provider tag
--
-- NOTE on ADD COLUMN NOT NULL with no default: only valid because the table is
-- empty (zero rows). §0 pre-flight confirms row_count = 0 before you migrate.
--
-- EXECUTION: run §0 (paste), then §1 as one BEGIN..COMMIT submission (no text
-- selected), then §2 (paste). DB-first — action code lands only after §2 is green.
--
-- ============================================================


-- ============================================================
-- SECTION 0 — PRE-FLIGHT (read-only; run + paste first)
-- ============================================================
-- Expect:
--   table_exists = true
--   row_count = 0                  (required for NOT NULL ADD COLUMN)
--   provider_col_exists = false
--   function_exists = false
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='phone_verifications') AS table_exists,
  (SELECT count(*) FROM public.phone_verifications)                          AS row_count,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='phone_verifications'
            AND column_name='provider')                                      AS provider_col_exists,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='mark_phone_verified')      AS function_exists;


-- ============================================================
-- SECTION 1 — MIGRATION (one transaction)
-- ============================================================
BEGIN;

-- 1. provider column — records the sending vendor per row.
ALTER TABLE public.phone_verifications
  ADD COLUMN provider text NOT NULL;

ALTER TABLE public.phone_verifications
  ADD CONSTRAINT phone_verifications_provider_check
  CHECK (provider IN ('termii', 'arkesel'));

-- 2. atomic verify-success function.
CREATE OR REPLACE FUNCTION public.mark_phone_verified(
  p_verification_id uuid,
  p_user_id         uuid,
  p_provider_tag    text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.phone_verifications%ROWTYPE;
BEGIN
  -- Lock the row to serialize against concurrent verify attempts.
  SELECT * INTO v_row
  FROM public.phone_verifications
  WHERE id = p_verification_id
  FOR UPDATE;

  -- No such row.
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Caller validation (defense in depth): the row must belong to the user the
  -- action authenticated. The action already checks this, but the function
  -- must not trust its caller blindly.
  IF v_row.user_id <> p_user_id THEN
    RETURN false;
  END IF;

  -- Single-consume race guard: if already consumed, do nothing.
  IF v_row.consumed_at IS NOT NULL THEN
    RETURN false;
  END IF;

  -- Consume this OTP.
  UPDATE public.phone_verifications
  SET consumed_at = now()
  WHERE id = p_verification_id;

  -- Idempotent profile updates: append only if not already present.
  UPDATE public.profiles
  SET
    verification_status = CASE
      WHEN 'phone_verified' = ANY(verification_status) THEN verification_status
      ELSE array_append(verification_status, 'phone_verified')
    END,
    auth_providers = CASE
      WHEN p_provider_tag = ANY(auth_providers) THEN auth_providers
      ELSE array_append(auth_providers, p_provider_tag)
    END,
    updated_at = now()
  WHERE id = p_user_id;

  RETURN true;
END;
$fn$;

-- Lock down EXECUTE: only the service role (server actions via createAdminClient)
-- may call this. Prevents authenticated/anon from invoking it over rpc to
-- self-grant phone verification.
--
-- CRITICAL: Supabase auto-grants EXECUTE on public-schema functions to BOTH
-- `anon` and `authenticated` roles. `REVOKE ... FROM PUBLIC` does NOT remove
-- those role-specific grants — they must each be revoked explicitly, or any
-- signed-in user could rpc() this function to self-grant phone verification.
-- Verified via information_schema.routine_privileges: neither anon nor
-- authenticated may appear (only the owner + service_role).
REVOKE EXECUTE ON FUNCTION public.mark_phone_verified(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_phone_verified(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_phone_verified(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_phone_verified(uuid, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- SECTION 2 — VERIFICATION (read-only; run + paste after migrating)
-- ============================================================

-- 2a. provider column present, NOT NULL, no default.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='phone_verifications' AND column_name='provider';

-- 2b. CHECK constraint present with the {termii,arkesel} allowlist.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid='public.phone_verifications'::regclass
  AND conname='phone_verifications_provider_check';

-- 2c. Function exists, SECURITY DEFINER, search_path pinned.
SELECT
  p.proname,
  p.prosecdef AS security_definer,        -- expect true
  p.proconfig AS config                    -- expect {search_path=public}
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='mark_phone_verified';

-- 2d. EXECUTE granted to service_role, NOT to anon/authenticated/public.
--     PASS = service_role present (owner role e.g. postgres may also appear)
--     AND anon/authenticated/PUBLIC all ABSENT. Supabase auto-grants anon +
--     authenticated on creation, so the triple REVOKE above is mandatory.
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema='public' AND routine_name='mark_phone_verified'
ORDER BY grantee;

-- ============================================================
-- END OF E.2.1.1
-- ============================================================
