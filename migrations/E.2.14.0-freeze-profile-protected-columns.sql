-- ============================================================
-- E.2.14.0-freeze-profile-protected-columns.sql
-- Lock down owner-self-write on monetization + identity-trust fields
-- ============================================================
--
-- Two additive changes, one transaction:
--   1. CREATE TRIGGER profiles_freeze_protected (BEFORE UPDATE on profiles).
--      Blocks any change to EIGHT protected columns unless the LOCAL GUC
--      app.profile_system_write_authorized = 'true' is set inside the
--      caller's transaction (mirrors the E.2.2.0 grant_admin_role pattern).
--      Columns guarded:
--          display_name                    (permanently frozen after signup)
--          phone                           (admin-request-only changes)
--          tier                            (system-only — Pro/billing)
--          tier_started_at                 (system-only — Pro/billing)
--          tier_expires_at                 (system-only — Pro/billing)
--          signup_free_reveals_remaining   (system-only — credit balance)
--          pro_activated_at                (system-only — Pro state)
--          is_disabled                     (admin-only — account moderation)
--   2. ALTER COLUMN signup_free_reveals_remaining SET DEFAULT 3
--      (D-133 — beta default is 3 lifetime reveals, was 1). Affects NEW
--      rows only; existing rows unchanged because the column is NOT NULL
--      and SET DEFAULT doesn't backfill.
--
-- Why a trigger instead of RLS WITH CHECK:
--   RLS WITH CHECK can't compare NEW vs OLD per column (no OLD reference
--   in policy expressions). Three precedents in this codebase use triggers
--   for column-level write rules (D-017): freeze_profile_role,
--   freeze_business_verification, freeze_product_hidden_at. This is #4 in
--   the family, mirroring the modern shape from E.2.13.0
--   (freeze_product_hidden_at): SECURITY DEFINER + search_path pinned +
--   REVOKE FROM PUBLIC + schema-qualified is_admin() + ERRCODE 42501.
--
-- Why a GUC bypass instead of "admin can bypass":
--   - display_name + phone: even admins shouldn't write directly via the
--     regular admin RLS path — future "rename user" / "change phone after
--     verified migration" flows should go through a dedicated SECURITY
--     DEFINER RPC that sets the GUC (so the change is intentional + auditable
--     in the calling RPC's logic, not arbitrary admin-Studio PATCH).
--   - Monetization fields (tier, reveals, Pro): same — these need to be
--     written by trusted code paths (future Paystack webhook handler, future
--     reveal-action), not by admins clicking around.
--   - is_disabled: same — future account-suspend SECURITY DEFINER RPC sets
--     the GUC, matching the grant_admin_role / revoke_admin_role shape.
--
-- Why NOT include verification_status + auth_providers:
--   These are written by mark_phone_verified (and mark_phone_verified ONLY).
--   That live RPC does NOT currently set the bypass GUC. Including these
--   columns in this freeze would BREAK production phone verification —
--   the K-066 blocker resolver. Hardening them is a separate future commit
--   that would also update mark_phone_verified to set the bypass.
--
-- Why NOT touch freeze_profile_role / K-021 search_path fix:
--   freeze_profile_role carries the E.2.2.0 admin-bootstrap GUC logic
--   (app.role_change_authorized). Touching it in the same migration that's
--   adding a different security-critical trigger risks the admin path.
--   K-021 (low severity, deferred) stays deferred.
--
-- INVENTORIED LEGITIMATE WRITES TO THE EIGHT COLUMNS TODAY: ZERO.
--   - display_name / phone: set ONLY at INSERT via the handle_new_user
--     trigger. No post-signup writer in src/ or migrations/.
--   - tier / tier_started_at / tier_expires_at / pro_activated_at: no
--     writer (Pro/Paystack unbuilt per D-129 Phase 2+).
--   - signup_free_reveals_remaining: no writer (reveal feature unbuilt per
--     D-133's "when built" framing).
--   - is_disabled: no writer (account moderation unbuilt; current
--     owner-self-disable gap closes here too).
--   This migration is purely defensive — establishes the discipline now,
--   before any of these features ship.
--
-- IMPORTANT — service-role behavior:
--   Service-role JWT makes auth.uid() return NULL. public.is_admin(NULL)
--   returns false. v_bypass falls through to false unless the GUC is set.
--   So a direct service-role PATCH against any protected column WILL be
--   blocked. This is correct: service-role isn't a magic bypass for trust
--   columns; legit code paths wrap writes in a SECURITY DEFINER fn that
--   sets the bypass first.
--
-- EXECUTION (Supabase SQL Editor):
--   The Editor session runs as `authenticated` by default; CREATE FUNCTION /
--   CREATE TRIGGER / ALTER FUNCTION privileges need the `postgres` role.
--   Run `RESET ROLE;` first (returns the session to its login role —
--   postgres in the Editor). Then run §0 (paste), §1 (entire BEGIN..COMMIT,
--   no text selected), §2 (paste).
--
-- ============================================================


-- ============================================================
-- SECTION 0 — PRE-FLIGHT (read-only; run + paste first)
-- ============================================================
-- Expect:
--   profiles_exists                  = true
--   trigger_already_exists           = false
--   trigger_fn_already_exists        = false
--   freeze_profile_role_still_present = true   (sanity — we are NOT touching it)
--   current_reveals_default          = '1'     (will become '3')
--   is_admin_helper_present          = true   (the freeze fn calls it)
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='profiles') AS profiles_exists,
  EXISTS (SELECT 1 FROM pg_trigger
          WHERE tgname='profiles_freeze_protected'
            AND tgrelid='public.profiles'::regclass)             AS trigger_already_exists,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public'
            AND p.proname='freeze_profile_protected_columns')    AS trigger_fn_already_exists,
  EXISTS (SELECT 1 FROM pg_trigger
          WHERE tgname='profiles_freeze_role'
            AND tgrelid='public.profiles'::regclass)             AS freeze_profile_role_still_present,
  (SELECT column_default FROM information_schema.columns
   WHERE table_schema='public' AND table_name='profiles'
     AND column_name='signup_free_reveals_remaining')            AS current_reveals_default,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='is_admin')     AS is_admin_helper_present;


-- ============================================================
-- SECTION 1 — MIGRATION (one transaction)
-- ============================================================
-- Run as `postgres` (RESET ROLE; in the SQL Editor first).
BEGIN;

-- ----- 1. Freeze trigger function -----
CREATE OR REPLACE FUNCTION public.freeze_profile_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  -- Bypass: a LOCAL GUC set by a SECURITY DEFINER fn that legitimately
  -- needs to write a protected column (future Paystack webhook handler,
  -- future admin rename fn, future account-suspend fn, etc.). Mirrors the
  -- E.2.2.0 app.role_change_authorized mechanism used by grant_admin_role
  -- and revoke_admin_role. current_setting(name, true) returns NULL if
  -- the setting is missing instead of raising; we coerce to false.
  v_bypass boolean := COALESCE(
    NULLIF(current_setting('app.profile_system_write_authorized', true), '')::boolean,
    false
  );
BEGIN
  IF v_bypass THEN
    -- Legit system-write path opted in. Skip all guards.
    RETURN NEW;
  END IF;

  -- (1) Permanently frozen post-signup. No self-service, no regular-admin
  --     path. Only the GUC bypass (e.g., a future admin "rename user"
  --     SECURITY DEFINER fn) can change it.
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    RAISE EXCEPTION 'profiles.display_name is frozen after signup'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  -- (2) Phone: admin-request only (via future SECURITY DEFINER RPC that
  --     sets the GUC). Self-service would require a re-OTP-verification
  --     ceremony that today's verification flow doesn't model.
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    RAISE EXCEPTION 'profiles.phone can only be changed by an admin request'
      USING ERRCODE = '42501';
  END IF;

  -- (3) Monetization fields: system-only. Owner-self-write of these would
  --     be a self-grant vulnerability (the reason this migration exists).
  --     Future Paystack webhook + reveal-action will write these via a
  --     SECURITY DEFINER fn that sets the GUC.
  IF NEW.tier IS DISTINCT FROM OLD.tier THEN
    RAISE EXCEPTION 'profiles.tier is system-controlled'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.tier_started_at IS DISTINCT FROM OLD.tier_started_at THEN
    RAISE EXCEPTION 'profiles.tier_started_at is system-controlled'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.tier_expires_at IS DISTINCT FROM OLD.tier_expires_at THEN
    RAISE EXCEPTION 'profiles.tier_expires_at is system-controlled'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.signup_free_reveals_remaining IS DISTINCT FROM OLD.signup_free_reveals_remaining THEN
    RAISE EXCEPTION 'profiles.signup_free_reveals_remaining is system-controlled'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.pro_activated_at IS DISTINCT FROM OLD.pro_activated_at THEN
    RAISE EXCEPTION 'profiles.pro_activated_at is system-controlled'
      USING ERRCODE = '42501';
  END IF;

  -- (4) is_disabled: admin-only via future account-suspend SECURITY DEFINER
  --     RPC. Also closes the existing owner-self-disable gap (RLS today
  --     permits the owner to set their own is_disabled=true, which would
  --     trip the public-read filter on their own rows — incoherent).
  IF NEW.is_disabled IS DISTINCT FROM OLD.is_disabled THEN
    RAISE EXCEPTION 'profiles.is_disabled is admin-controlled'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.freeze_profile_protected_columns() FROM PUBLIC;

CREATE TRIGGER profiles_freeze_protected
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_profile_protected_columns();

-- ----- 2. D-133 — beta default for signup_free_reveals_remaining -----
-- The column is NOT NULL, so SET DEFAULT doesn't backfill — only new rows
-- (future signups) get the new default. Existing rows are unaffected.
-- For pre-existing rows where the value is stale, a separate UPDATE
-- migration can run (out of scope here per the directive).
ALTER TABLE public.profiles
  ALTER COLUMN signup_free_reveals_remaining SET DEFAULT 3;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- SECTION 2 — VERIFICATION (read-only-ish; the live-fire checks
-- in §2g/§2h are wrapped in ROLLBACK so they don't mutate data)
-- ============================================================

-- 2a. Function exists, SECURITY DEFINER, search_path pinned to public.
SELECT
  p.proname,
  p.prosecdef AS security_definer,     -- expect true
  p.proconfig AS config                  -- expect {search_path=public}
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='freeze_profile_protected_columns';

-- 2b. EXECUTE revoked from PUBLIC. Expect: NO row with grantee='PUBLIC'.
--     Function owner (postgres) and possibly service_role may appear.
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema='public'
  AND routine_name='freeze_profile_protected_columns'
ORDER BY grantee;

-- 2c. Trigger attached to profiles, BEFORE UPDATE, fires per row.
--     tgtype bit 0x02 = BEFORE; bit 0x01 = FOR EACH ROW.
SELECT tgname, tgenabled, tgtype
FROM pg_trigger
WHERE tgname='profiles_freeze_protected'
  AND tgrelid='public.profiles'::regclass;

-- 2d. Both freeze triggers present on profiles (the new one + the
--     untouched freeze_profile_role). Expect 2 rows.
SELECT tgname
FROM pg_trigger
WHERE tgrelid='public.profiles'::regclass
  AND tgname IN ('profiles_freeze_role', 'profiles_freeze_protected')
ORDER BY tgname;

-- 2e. signup_free_reveals_remaining default is now 3.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles'
  AND column_name='signup_free_reveals_remaining';

-- 2f. Sanity — existing rows are NOT retroactively updated. Confirms that
--     SET DEFAULT only applies to new INSERTs.
SELECT
  count(*) AS total_profiles,
  count(*) FILTER (WHERE signup_free_reveals_remaining = 1) AS rows_still_at_old_default,
  count(*) FILTER (WHERE signup_free_reveals_remaining = 3) AS rows_at_new_default;

-- 2g. POSITIVE CONTROL — a non-protected column UPDATE still succeeds.
--     Picks any one existing profile row and toggles state_id to itself
--     (no-op write that nonetheless fires the trigger). Wrapped in
--     ROLLBACK to leave production data untouched.
--     Expect: no error.
BEGIN;
  DO $$
  DECLARE
    v_id uuid;
    v_state uuid;
  BEGIN
    SELECT id, state_id INTO v_id, v_state FROM public.profiles LIMIT 1;
    IF v_id IS NULL THEN
      RAISE NOTICE 'POSITIVE CONTROL skipped — no profiles in DB';
    ELSE
      UPDATE public.profiles SET state_id = v_state WHERE id = v_id;
      RAISE NOTICE 'POSITIVE CONTROL passed — non-protected UPDATE succeeded';
    END IF;
  END $$;
ROLLBACK;

-- 2h. NEGATIVE CONTROL — a protected-column UPDATE without the bypass
--     GUC raises ERRCODE 42501. The DO block catches the exception so the
--     verification doesn't error out the SQL Editor session. Wrapped in
--     ROLLBACK.
--     Expect: notice "NEGATIVE CONTROL passed — protected UPDATE blocked".
BEGIN;
  DO $$
  DECLARE
    v_id uuid;
    v_current_tier text;
  BEGIN
    SELECT id, tier INTO v_id, v_current_tier FROM public.profiles LIMIT 1;
    IF v_id IS NULL THEN
      RAISE NOTICE 'NEGATIVE CONTROL skipped — no profiles in DB';
    ELSE
      BEGIN
        -- Try to set tier to a different value (free→pro toggle). The
        -- trigger should raise 42501.
        UPDATE public.profiles
        SET tier = CASE WHEN v_current_tier = 'free' THEN 'pro' ELSE 'free' END
        WHERE id = v_id;
        RAISE EXCEPTION 'NEGATIVE CONTROL FAILED — protected UPDATE was NOT blocked';
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'NEGATIVE CONTROL passed — protected UPDATE blocked (42501)';
      END;
    END IF;
  END $$;
ROLLBACK;

-- 2i. BYPASS CONTROL — same protected-column UPDATE succeeds WITH the GUC
--     set. Confirms the legit-system-write path works as designed.
--     Wrapped in ROLLBACK.
--     Expect: notice "BYPASS CONTROL passed — UPDATE succeeded with GUC set".
BEGIN;
  DO $$
  DECLARE
    v_id uuid;
    v_current_tier text;
  BEGIN
    SELECT id, tier INTO v_id, v_current_tier FROM public.profiles LIMIT 1;
    IF v_id IS NULL THEN
      RAISE NOTICE 'BYPASS CONTROL skipped — no profiles in DB';
    ELSE
      PERFORM set_config('app.profile_system_write_authorized', 'true', true);
      UPDATE public.profiles
      SET tier = CASE WHEN v_current_tier = 'free' THEN 'pro' ELSE 'free' END
      WHERE id = v_id;
      RAISE NOTICE 'BYPASS CONTROL passed — UPDATE succeeded with GUC set';
    END IF;
  END $$;
ROLLBACK;

-- 2j. Sanity — freeze_profile_role is untouched (still SECURITY DEFINER,
--     still present, still attached). Confirms we didn't accidentally
--     drop/replace the existing admin-bootstrap trigger.
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  EXISTS (SELECT 1 FROM pg_trigger
          WHERE tgname='profiles_freeze_role'
            AND tgrelid='public.profiles'::regclass) AS trigger_still_attached
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='freeze_profile_role';

-- ============================================================
-- END OF E.2.14.0
-- ============================================================
