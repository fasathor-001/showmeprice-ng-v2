-- ============================================================
-- E.2.20.0 — account suspension foundation (Feature J Stage 2)
-- ============================================================
--
-- PURPOSE
--   Activates `profiles.is_disabled` as the suspension flag. The column
--   has existed since the original schema; the E.2.14.0 freeze trigger
--   reserved it for "future account-suspend SECURITY DEFINER RPC".
--   This migration is that RPC, plus the supporting audit-action +
--   self-read policy needed for the middleware to function (Stage J.4).
--
-- DEPENDENCIES (must be present before this migration runs):
--   - public.is_admin(uuid)                                 [0001 RLS]
--   - profiles.is_disabled column                           [0000 schema]
--   - profiles_freeze_protected trigger                     [E.2.14.0]
--   - profile_admin_changes table + action CHECK            [E.2.15.0]
--   - businesses.is_disabled column                         [0000 schema]
--   - profiles_public_read RLS policy                       [0001 RLS]
--
-- LOCKED DECISIONS (from Stage J.1 review):
--   1. Self-suspension refused inside RPC (p_granter != p_target).
--   2. Two distinct audit actions: 'account_suspended', 'account_unsuspended'.
--   3. Reason length 5..500 chars (matches E.2.16.0 precedent).
--   4. profiles_self_read policy lands here (J.4 middleware blocker).
--   5. Suspension cascades businesses.is_disabled = true for owned businesses.
--   6. Unsuspension does NOT auto-undisable businesses — admin reviews
--      them separately. Business re-enable is a future admin action.
--   7. RPCs raise on already-in-target-state (no silent idempotent no-op).
--   8. No force-invalidation of Supabase sessions (deferred).
--
-- WHY profile_admin_changes NOT admin_action_log:
--   admin_action_log.admin_id FKs to admins.id (separate table per D-078).
--   profile_admin_changes.granter_id FKs to profiles.id, which matches the
--   profiles.role='admin' check used everywhere else today. D-081 defers
--   admin-model unification; we use the table whose FK shape matches
--   today's runtime, not the deferred one.
--
-- EXECUTION (Supabase SQL Editor):
--   §0 = read-only pre-flight, paste back. If it raises, STOP and investigate.
--   §1..§5 = single BEGIN..COMMIT migration transaction; paste together.
--   §6 = read-only verification, paste back after COMMIT.
--
-- ============================================================


-- ============================================================
-- §0 — PRE-FLIGHT (read-only; run + paste first)
-- ============================================================
-- The E.2.14.0 schema comment promised: "is_disabled: no writer (account
-- moderation unbuilt)". If any profiles already have is_disabled=true,
-- something wrote outside the documented contract — investigate before
-- activating suspension semantics. Expected: existing_disabled_count = 0.

DO $$
DECLARE
  existing_disabled_count integer;
BEGIN
  SELECT count(*) INTO existing_disabled_count
  FROM public.profiles
  WHERE is_disabled = true;

  IF existing_disabled_count > 0 THEN
    RAISE EXCEPTION
      'Pre-flight failed: % profiles already have is_disabled=true. Stage J.2 expects 0. Stop and investigate before applying §1..§5.',
      existing_disabled_count;
  END IF;
END $$;

-- Confirm dependencies are present. Expect 6 rows of `true`.
SELECT
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='is_admin')                        AS is_admin_present,
  EXISTS (SELECT 1 FROM pg_trigger
          WHERE tgname='profiles_freeze_protected'
            AND tgrelid='public.profiles'::regclass)                             AS freeze_trigger_present,
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conname='profile_admin_changes_action_check'
            AND conrelid='public.profile_admin_changes'::regclass)               AS check_constraint_present,
  EXISTS (SELECT 1 FROM pg_policies
          WHERE policyname='profiles_public_read' AND tablename='profiles')      AS public_read_policy_present,
  NOT EXISTS (SELECT 1 FROM pg_policies
              WHERE policyname='profiles_self_read' AND tablename='profiles')    AS self_read_policy_absent,
  NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='admin_suspend_user')          AS suspend_rpc_absent;


-- ============================================================
-- §1..§5 — MIGRATION (BEGIN..COMMIT)
-- ============================================================
-- Run as `postgres` (RESET ROLE; in the SQL Editor first).

BEGIN;

-- ----- §1. Extend profile_admin_changes.action CHECK constraint -----
-- E.2.15.0 created the constraint with two values: phone_changed,
-- location_changed. The table's file-level comment explicitly anticipated
-- this extension: "Future stages extend the CHECK to add ... 'account_suspended'".
-- We drop + recreate with the original two values plus the two new ones.
-- All existing rows continue to satisfy the constraint (no data migration).

ALTER TABLE public.profile_admin_changes
  DROP CONSTRAINT profile_admin_changes_action_check;

ALTER TABLE public.profile_admin_changes
  ADD CONSTRAINT profile_admin_changes_action_check CHECK (
    action IN (
      'phone_changed',
      'location_changed',
      'account_suspended',
      'account_unsuspended'
    )
  );


-- ----- §2. profiles_self_read RLS policy -----
-- Without this, a suspended user (is_disabled=true) cannot read their own
-- profile row because profiles_public_read enforces is_disabled=false.
-- Stage J.4 middleware needs the user's own row to detect their own
-- suspension; without this policy, the suspension flag would be invisible
-- to the very check that's supposed to consume it.
--
-- PostgreSQL OR-combines RLS policies on the same operation. This policy
-- ADDS a self-readable path; it does NOT relax the existing public-read
-- filter for other rows. A user can read their own row regardless of
-- is_disabled; they still cannot read other users' disabled rows.

CREATE POLICY "profiles_self_read"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);


-- ----- §3. admin_suspend_user RPC -----
-- Shape mirrors E.2.16.0's admin_change_user_phone:
--   - SECURITY DEFINER + SET search_path = public
--   - In-function is_admin(p_granter_id) gate (the real authz)
--   - Reason length 5..500 with ERRCODE 22023
--   - target-not-found → P0002
--   - GUC bypass via set_config(..., 'true', true) [LOCAL] before UPDATE
--   - Audit INSERT directly (SECURITY DEFINER bypasses RLS on
--     profile_admin_changes, which has no INSERT policy by design)
--
-- DEVIATION from E.2.16.0's idempotent no-op pattern:
--   change_user_phone returns false on same-value writes. Suspension
--   raises an exception instead (per Stage J.1 locked decision #7) so
--   accidental re-suspension surfaces to the admin rather than silently
--   succeeding — an admin needs to know whether their click did anything.

CREATE OR REPLACE FUNCTION public.admin_suspend_user(
  p_target_user_id uuid,
  p_granter_id     uuid,
  p_reason         text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_disabled boolean;
BEGIN
  -- 1. Authorization. Defense in depth: actions.ts also gates via requireAdmin().
  IF NOT public.is_admin(p_granter_id) THEN
    RAISE EXCEPTION 'insufficient_privilege: caller is not an admin'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Self-suspension refused. An admin must not lock themselves out
  --    by mistake; emergency lockdown of a compromised admin goes
  --    through another admin or service-role direct SQL.
  IF p_granter_id = p_target_user_id THEN
    RAISE EXCEPTION 'self_suspension_refused: granter and target must differ'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Reason length 5..500 chars.
  IF length(trim(coalesce(p_reason, ''))) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'reason must be between 5 and 500 characters'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Target exists + not already suspended. Raise on already-disabled
  --    so the operator sees that their click was a no-op.
  SELECT is_disabled INTO v_already_disabled
  FROM public.profiles
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target user not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_already_disabled THEN
    RAISE EXCEPTION 'target user is already suspended'
      USING ERRCODE = '22023';
  END IF;

  -- 5. Bypass GUC (LOCAL — transaction-scoped) so the E.2.14.0
  --    freeze_profile_protected_columns trigger lets the UPDATE through.
  --    Mirrors E.2.2.0's app.role_change_authorized precedent.
  PERFORM set_config('app.profile_system_write_authorized', 'true', true);

  -- 6. Suspend the user.
  UPDATE public.profiles
  SET is_disabled = true,
      updated_at  = now()
  WHERE id = p_target_user_id;

  -- 7. Cascade: disable all businesses owned by this user. D-146 visibility
  --    contract uses businesses.is_disabled across 6 public surfaces; this
  --    UPDATE removes the suspended user's listings from buyer view as a
  --    direct side effect, with no need to touch the 6 query sites.
  --    businesses.is_disabled is NOT under a freeze trigger — direct UPDATE
  --    via SECURITY DEFINER is permitted.
  UPDATE public.businesses
  SET is_disabled = true,
      updated_at  = now()
  WHERE owner_id = p_target_user_id;

  -- 8. Audit row. SECURITY DEFINER bypasses RLS; profile_admin_changes
  --    has no INSERT policy by design — this RPC is the write path.
  INSERT INTO public.profile_admin_changes
    (target_user_id, granter_id, action, previous_value, new_value, reason)
  VALUES
    (p_target_user_id, p_granter_id, 'account_suspended', 'false', 'true', p_reason);
END;
$$;

COMMENT ON FUNCTION public.admin_suspend_user(uuid, uuid, text) IS
  'E.2.20.0 / Feature J.2. Admin-driven account suspension. Validates caller-is-admin (42501), refuses self-suspension (42501), reason length 5..500 (22023), target exists (P0002), not already suspended (22023). Sets app.profile_system_write_authorized LOCAL, UPDATEs profiles.is_disabled=true, cascades businesses.is_disabled=true for owned businesses, INSERTs profile_admin_changes audit row with action=account_suspended. SECURITY DEFINER, search_path=public. EXECUTE locked down: REVOKE FROM PUBLIC + anon + service_role, GRANT to authenticated only (in-function is_admin enforces actual authz).';


-- ----- §4. admin_unsuspend_user RPC -----
-- Symmetric to §3. Reverses ONLY profiles.is_disabled — businesses stay
-- disabled per locked decision #6 (admin re-enables businesses separately
-- because they may have been disabled for non-suspension reasons before
-- the suspension event).

CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(
  p_target_user_id uuid,
  p_granter_id     uuid,
  p_reason         text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_disabled boolean;
BEGIN
  -- 1. Authorization.
  IF NOT public.is_admin(p_granter_id) THEN
    RAISE EXCEPTION 'insufficient_privilege: caller is not an admin'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Self-unsuspend refused. By symmetry with §3, and because
  --    public.is_admin() returns false when is_disabled=true anyway —
  --    a disabled admin would fail step 1, but we re-check here so the
  --    error message is precise about why.
  IF p_granter_id = p_target_user_id THEN
    RAISE EXCEPTION 'self_unsuspension_refused: granter and target must differ'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Reason length 5..500 chars.
  IF length(trim(coalesce(p_reason, ''))) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'reason must be between 5 and 500 characters'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Target exists + IS currently suspended.
  SELECT is_disabled INTO v_already_disabled
  FROM public.profiles
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target user not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_already_disabled THEN
    RAISE EXCEPTION 'target user is not suspended'
      USING ERRCODE = '22023';
  END IF;

  -- 5. Bypass GUC.
  PERFORM set_config('app.profile_system_write_authorized', 'true', true);

  -- 6. Unsuspend the user. NOTE: businesses.is_disabled is intentionally
  --    NOT touched here. The admin reviews owned businesses separately.
  UPDATE public.profiles
  SET is_disabled = false,
      updated_at  = now()
  WHERE id = p_target_user_id;

  -- 7. Audit row.
  INSERT INTO public.profile_admin_changes
    (target_user_id, granter_id, action, previous_value, new_value, reason)
  VALUES
    (p_target_user_id, p_granter_id, 'account_unsuspended', 'true', 'false', p_reason);
END;
$$;

COMMENT ON FUNCTION public.admin_unsuspend_user(uuid, uuid, text) IS
  'E.2.20.0 / Feature J.2. Admin-driven account unsuspension. Validates caller-is-admin (42501), refuses self-unsuspension (42501), reason length 5..500 (22023), target exists (P0002), currently suspended (22023). Reverses ONLY profiles.is_disabled — owned businesses stay disabled (admin reviews separately). INSERTs profile_admin_changes audit row with action=account_unsuspended. SECURITY DEFINER, search_path=public. EXECUTE locked down to authenticated.';


-- ----- §5. ACL lockdown on both RPCs -----
-- Supabase auto-grants EXECUTE to anon/authenticated/service_role on
-- public functions; REVOKE FROM PUBLIC alone does NOT remove the
-- role-specific grants. Explicit triple-REVOKE matches E.2.16.0 precedent.

REVOKE EXECUTE ON FUNCTION public.admin_suspend_user(uuid, uuid, text)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_suspend_user(uuid, uuid, text)   FROM anon, service_role;
GRANT  EXECUTE ON FUNCTION public.admin_suspend_user(uuid, uuid, text)   TO   authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_unsuspend_user(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_unsuspend_user(uuid, uuid, text) FROM anon, service_role;
GRANT  EXECUTE ON FUNCTION public.admin_unsuspend_user(uuid, uuid, text) TO   authenticated;


NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- §6 — VERIFICATION (read-only; run + paste after COMMIT)
-- ============================================================
-- Confirms the policy + functions + extended CHECK constraint all exist.

DO $$
BEGIN
  PERFORM 1 FROM pg_policies
    WHERE policyname='profiles_self_read' AND tablename='profiles';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profiles_self_read policy not created';
  END IF;

  PERFORM 1 FROM pg_proc WHERE proname='admin_suspend_user';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_suspend_user RPC not created';
  END IF;

  PERFORM 1 FROM pg_proc WHERE proname='admin_unsuspend_user';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_unsuspend_user RPC not created';
  END IF;
END $$;

-- Read-back checks for the operator to paste. Expect:
--   - 1 row for the new policy, qual = (auth.uid() = id)
--   - 1 row for the CHECK constraint, definition includes the 4 action values
--   - 2 rows for the two RPC ACLs, grantee=authenticated
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename='profiles' AND policyname='profiles_self_read';

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid='public.profile_admin_changes'::regclass
  AND conname='profile_admin_changes_action_check';

SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema='public'
  AND routine_name IN ('admin_suspend_user','admin_unsuspend_user')
ORDER BY routine_name, grantee;
