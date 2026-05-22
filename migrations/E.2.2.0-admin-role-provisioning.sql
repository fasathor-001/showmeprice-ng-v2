-- ============================================================
-- E.2.2.0-admin-role-provisioning.sql
-- Stage 2.A.1 — Admin role provisioning (D-105)
-- ============================================================
--
-- Implements D-105 via a GUC-guarded freeze_profile_role bypass (surfaced
-- during agent investigation; NOT in D-105's original implications — banked
-- as a MEMORY principle in the same commit).
--
-- Ships, in one transaction:
--   1. TABLE admin_role_changes (append-only audit; admin-only SELECT RLS).
--   2. CREATE OR REPLACE freeze_profile_role() — adds a transaction-local GUC
--      bypass branch (app.role_change_authorized='on'). Only the two
--      service_role-locked SECURITY DEFINER functions below can set it; it
--      dies at txn end (LOCAL scope). All other callers still require an
--      authenticated admin (unchanged behavior).
--   3. FUNCTION grant_admin_role(target, granter, reason)  — SECURITY DEFINER.
--   4. FUNCTION revoke_admin_role(target, granter, reason) — SECURITY DEFINER.
--   Both triple-REVOKE'd (anon + authenticated + PUBLIC) then GRANT service_role,
--   per the banked SECURITY DEFINER lockdown principle (E.2.1.1).
--
-- Authorization lives INSIDE the functions:
--   * grant: granter NULL = bootstrap (service_role-trusted; the calling action
--     guarantees email == ADMIN_BOOTSTRAP_EMAIL). granter NOT NULL must be an
--     active admin (defense in depth). Idempotent: already-admin → no-op, no audit.
--   * revoke: self-revoke forbidden; granter must be active admin; idempotent
--     (not-admin target → no-op); last-active-admin guard (defense in depth —
--     normally shadowed by the self-revoke + granter-must-be-admin guards, see
--     §2h note).
--
-- EXECUTION: run §0 (paste), then §1 as ONE BEGIN..COMMIT submission (no text
-- selected — partial-execution trap), then §2 (paste). DB-first: Commit 3+ code
-- lands only after §2 is green.
-- ============================================================


-- ============================================================
-- SECTION 0 — PRE-FLIGHT (read-only; run + paste first)
-- ============================================================
-- Expect:
--   table_exists        = false
--   grant_fn_exists     = false
--   revoke_fn_exists    = false
--   active_admin_count  = (however many admins exist today; informational)
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='admin_role_changes')        AS table_exists,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='grant_admin_role')              AS grant_fn_exists,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='revoke_admin_role')            AS revoke_fn_exists,
  (SELECT count(*) FROM public.profiles
   WHERE role='admin' AND is_disabled=false)                                      AS active_admin_count;

-- 0b. Current freeze_profile_role body — capture so we know exactly what we're
--     replacing (expect the original two-branch version with NO GUC check).
SELECT pg_get_functiondef(p.oid) AS current_freeze_profile_role
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='freeze_profile_role';


-- ============================================================
-- SECTION 1 — MIGRATION (one transaction)
-- ============================================================
BEGIN;

-- 1. Append-only audit table.
CREATE TABLE public.admin_role_changes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  granter_id     uuid,                       -- NULL for bootstrap (no granter)
  action         text NOT NULL,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_role_changes_target_user_id_profiles_id_fk
    FOREIGN KEY (target_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT,
  CONSTRAINT admin_role_changes_granter_id_profiles_id_fk
    FOREIGN KEY (granter_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT admin_role_changes_action_check
    CHECK (action IN ('granted', 'revoked', 'bootstrap'))
);

CREATE INDEX admin_role_changes_target_user_id_idx ON public.admin_role_changes(target_user_id);
CREATE INDEX admin_role_changes_granter_id_idx     ON public.admin_role_changes(granter_id);
CREATE INDEX admin_role_changes_created_at_idx      ON public.admin_role_changes(created_at DESC);

-- RLS: admins read; nobody writes via the API (no INSERT/UPDATE/DELETE policy →
-- append-only from the client's perspective). Writes happen only through the
-- SECURITY DEFINER functions (which run as owner and bypass RLS) / service_role.
ALTER TABLE public.admin_role_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_role_changes_select_admins ON public.admin_role_changes
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- 2. freeze_profile_role + GUC bypass branch. Preserves the original logic
--    verbatim and ADDS one branch: a transaction-local authorization flag set
--    only by grant_admin_role / revoke_admin_role. (search_path intentionally
--    left as the pre-existing definition to avoid changing unrelated behavior;
--    tracked as K-021 for a future hardening pass.)
CREATE OR REPLACE FUNCTION freeze_profile_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- D-105 GUC-guarded bypass: the two service_role-locked admin-provisioning
    -- functions set this LOCAL flag immediately before their protected UPDATE.
    -- LOCAL scope dies at COMMIT/ROLLBACK. No other caller can set it
    -- (set_config lives in pg_catalog, not exposed via PostgREST).
    IF current_setting('app.role_change_authorized', true) = 'on' THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin' AND is_disabled = false
    ) THEN
      RAISE EXCEPTION 'profiles.role can only be changed by an admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. grant_admin_role — atomic role grant + audit. Bootstrap (granter NULL) or
--    delegated (granter must be active admin). Idempotent on already-admin.
CREATE OR REPLACE FUNCTION public.grant_admin_role(
  p_target_user_id uuid,
  p_granter_id     uuid,
  p_reason         text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_target_role text;
  v_action      text;
BEGIN
  -- Target must exist; lock the row to serialize concurrent grants.
  SELECT role::text INTO v_target_role
  FROM public.profiles
  WHERE id = p_target_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target user % does not exist', p_target_user_id;
  END IF;

  -- Idempotent: already admin → no-op, no audit row.
  IF v_target_role = 'admin' THEN
    RETURN false;
  END IF;

  -- Authorization.
  IF p_granter_id IS NULL THEN
    v_action := 'bootstrap';                       -- service_role-trusted path
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_granter_id AND role = 'admin' AND is_disabled = false
    ) THEN
      RAISE EXCEPTION 'granter % is not an active admin', p_granter_id;
    END IF;
    v_action := 'granted';
  END IF;

  -- Authorize the role change for THIS transaction only (freeze bypass).
  PERFORM set_config('app.role_change_authorized', 'on', true);

  UPDATE public.profiles
  SET role = 'admin', updated_at = now()
  WHERE id = p_target_user_id;

  INSERT INTO public.admin_role_changes (target_user_id, granter_id, action, reason)
  VALUES (p_target_user_id, p_granter_id, v_action, p_reason);

  RETURN true;
END;
$fn$;

-- 4. revoke_admin_role — atomic role revoke + audit. No bootstrap path.
CREATE OR REPLACE FUNCTION public.revoke_admin_role(
  p_target_user_id uuid,
  p_granter_id     uuid,
  p_reason         text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_target_role     text;
  v_target_disabled boolean;
  v_active_admins   integer;
BEGIN
  -- Self-revoke forbidden (D-105 out-of-scope rule).
  IF p_granter_id IS NOT NULL AND p_granter_id = p_target_user_id THEN
    RAISE EXCEPTION 'admins cannot revoke their own admin role';
  END IF;

  -- Granter must be an active admin (no bootstrap path for revoke).
  IF p_granter_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_granter_id AND role = 'admin' AND is_disabled = false
  ) THEN
    RAISE EXCEPTION 'granter % is not an active admin', p_granter_id;
  END IF;

  SELECT role::text, is_disabled INTO v_target_role, v_target_disabled
  FROM public.profiles
  WHERE id = p_target_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target user % does not exist', p_target_user_id;
  END IF;

  -- Idempotent: not an admin → no-op, no audit row.
  IF v_target_role IS DISTINCT FROM 'admin' THEN
    RETURN false;
  END IF;

  -- Last-active-admin guard (defense in depth; see §2h note on reachability).
  IF v_target_disabled = false THEN
    SELECT count(*) INTO v_active_admins
    FROM public.profiles
    WHERE role = 'admin' AND is_disabled = false;
    IF v_active_admins <= 1 THEN
      RAISE EXCEPTION 'cannot revoke the last remaining active admin';
    END IF;
  END IF;

  PERFORM set_config('app.role_change_authorized', 'on', true);

  UPDATE public.profiles
  SET role = NULL, updated_at = now()
  WHERE id = p_target_user_id;

  INSERT INTO public.admin_role_changes (target_user_id, granter_id, action, reason)
  VALUES (p_target_user_id, p_granter_id, 'revoked', p_reason);

  RETURN true;
END;
$fn$;

-- 5. EXECUTE lockdown (mandatory triple-REVOKE — Supabase auto-grants anon +
--    authenticated; REVOKE FROM PUBLIC alone does NOT remove those).
REVOKE EXECUTE ON FUNCTION public.grant_admin_role(uuid, uuid, text)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_admin_role(uuid, uuid, text)  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_admin_role(uuid, uuid, text)  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.grant_admin_role(uuid, uuid, text)  TO service_role;

REVOKE EXECUTE ON FUNCTION public.revoke_admin_role(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_admin_role(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_admin_role(uuid, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.revoke_admin_role(uuid, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- SECTION 2 — VERIFICATION (read-only unless noted; run + paste after §1)
-- ============================================================

-- 2a. Table columns: shape + nullability + defaults.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='admin_role_changes'
ORDER BY ordinal_position;

-- 2b. Constraints: two FKs (RESTRICT on target, SET NULL on granter) + action CHECK.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid='public.admin_role_changes'::regclass
ORDER BY conname;

-- 2c. RLS enabled + the admin-only SELECT policy present.
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.admin_role_changes'::regclass) AS rls_enabled,
  polname, cmd, qual
FROM pg_policies
WHERE schemaname='public' AND tablename='admin_role_changes';

-- 2d. Indexes present (target, granter, created_at DESC).
SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='admin_role_changes'
ORDER BY indexname;

-- 2e. Both functions exist, SECURITY DEFINER, search_path pinned to public.
SELECT p.proname,
       p.prosecdef AS security_definer,   -- expect true
       p.proconfig AS config              -- expect {search_path=public}
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('grant_admin_role','revoke_admin_role')
ORDER BY p.proname;

-- 2f. Grantee audit — PASS = service_role present (owner may appear),
--     anon / authenticated / PUBLIC all ABSENT, for BOTH functions.
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema='public'
  AND routine_name IN ('grant_admin_role','revoke_admin_role')
ORDER BY routine_name, grantee;

-- 2g. Re-dump freeze_profile_role — confirm EXACTLY ONE bypass branch (the GUC
--     check) was added and the admin-EXISTS branch is intact.
SELECT pg_get_functiondef(p.oid) AS new_freeze_profile_role
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='freeze_profile_role';

-- 2h. Synthetic-scenario behavioral test (pg_temp fn returning TABLE, all under
--     ROLLBACK — the banked pattern). Creates 3 throwaway auth.users (the
--     on_auth_user_created trigger auto-creates their profiles; we pass BOTH
--     'phone' and 'whatsapp_number' metadata keys to satisfy either trigger
--     body version), then exercises every guard. ROLLBACK discards everything.
--
--     NOTE on last-admin reachability: with self-revoke blocked AND granter
--     required to be an active admin, the only path to revoke admin X is via a
--     DIFFERENT active admin — which means ≥2 active admins exist, so the
--     count<=1 branch never fires through the public function. It is kept as
--     defense-in-depth (and mirrored by the UI's disabled Revoke button). The
--     reachable last-admin protections are S4 (self-revoke) + S6 (non-admin
--     granter), both asserted below.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.test_admin_role()
RETURNS TABLE (scenario text, expected text, actual text, pass boolean)
LANGUAGE plpgsql AS $t$
DECLARE
  u_a uuid := gen_random_uuid();   -- becomes bootstrap admin
  u_b uuid := gen_random_uuid();   -- granted then revoked
  u_c uuid := gen_random_uuid();   -- stays non-admin
  v_b boolean;
  v_err text;
  v_cnt integer;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (u_a, 'art-a@test.local', jsonb_build_object('display_name','A','phone','2349000000001','whatsapp_number','2349000000001')),
    (u_b, 'art-b@test.local', jsonb_build_object('display_name','B','phone','2349000000002','whatsapp_number','2349000000002')),
    (u_c, 'art-c@test.local', jsonb_build_object('display_name','C','phone','2349000000003','whatsapp_number','2349000000003'));

  -- S1: bootstrap grant (granter NULL) → true, role=admin, audit='bootstrap'.
  v_b := public.grant_admin_role(u_a, NULL, 'bootstrap');
  RETURN QUERY SELECT 'S1 bootstrap grant', 'true', v_b::text, (v_b IS TRUE);
  RETURN QUERY SELECT 'S1 role=admin', 'admin',
    (SELECT role::text FROM public.profiles WHERE id=u_a),
    ((SELECT role::text FROM public.profiles WHERE id=u_a) = 'admin');
  RETURN QUERY SELECT 'S1 audit=bootstrap', 'bootstrap',
    (SELECT action FROM public.admin_role_changes WHERE target_user_id=u_a ORDER BY created_at DESC LIMIT 1),
    ((SELECT action FROM public.admin_role_changes WHERE target_user_id=u_a ORDER BY created_at DESC LIMIT 1) = 'bootstrap');

  -- S2: idempotent re-grant → false, NO new audit row (still 1 for u_a).
  v_b := public.grant_admin_role(u_a, NULL, 'again');
  SELECT count(*) INTO v_cnt FROM public.admin_role_changes WHERE target_user_id=u_a;
  RETURN QUERY SELECT 'S2 re-grant returns false', 'false', v_b::text, (v_b IS FALSE);
  RETURN QUERY SELECT 'S2 no extra audit row', '1', v_cnt::text, (v_cnt = 1);

  -- S3: delegated grant by admin u_a → true, role=admin, audit='granted'.
  v_b := public.grant_admin_role(u_b, u_a, 'promote');
  RETURN QUERY SELECT 'S3 delegated grant', 'true', v_b::text, (v_b IS TRUE);
  RETURN QUERY SELECT 'S3 audit=granted', 'granted',
    (SELECT action FROM public.admin_role_changes WHERE target_user_id=u_b ORDER BY created_at DESC LIMIT 1),
    ((SELECT action FROM public.admin_role_changes WHERE target_user_id=u_b ORDER BY created_at DESC LIMIT 1) = 'granted');

  -- S4: self-revoke refused.
  BEGIN
    v_b := public.revoke_admin_role(u_a, u_a, 'self');
    v_err := 'NO EXCEPTION';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  RETURN QUERY SELECT 'S4 self-revoke refused', 'exception ~ own admin', v_err, (v_err ILIKE '%own admin%');

  -- S5: revoke u_b by admin u_a → true, role NULL, audit='revoked'.
  v_b := public.revoke_admin_role(u_b, u_a, 'demote');
  RETURN QUERY SELECT 'S5 revoke', 'true', v_b::text, (v_b IS TRUE);
  RETURN QUERY SELECT 'S5 role NULL', 'NULL',
    COALESCE((SELECT role::text FROM public.profiles WHERE id=u_b), 'NULL'),
    ((SELECT role FROM public.profiles WHERE id=u_b) IS NULL);

  -- S6: last admin (u_a) cannot be revoked by a non-admin granter (u_c).
  BEGIN
    v_b := public.revoke_admin_role(u_a, u_c, 'attack');
    v_err := 'NO EXCEPTION';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  RETURN QUERY SELECT 'S6 non-admin granter refused', 'exception ~ not an active admin', v_err, (v_err ILIKE '%not an active admin%');

  -- S7: grant by a now-non-admin granter (u_b, revoked in S5) refused.
  BEGIN
    v_b := public.grant_admin_role(u_c, u_b, 'attack');
    v_err := 'NO EXCEPTION';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  RETURN QUERY SELECT 'S7 revoked-granter cannot grant', 'exception ~ not an active admin', v_err, (v_err ILIKE '%not an active admin%');
END;
$t$;

SELECT * FROM pg_temp.test_admin_role();   -- every row's pass column must be TRUE

ROLLBACK;

-- ============================================================
-- END OF E.2.2.0
-- ============================================================
