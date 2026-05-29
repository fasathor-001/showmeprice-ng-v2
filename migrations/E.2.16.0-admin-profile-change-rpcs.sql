-- ============================================================
-- E.2.16.0-admin-profile-change-rpcs.sql
-- Stage 1 admin tools (Step 2 of N) — two SECURITY DEFINER RPCs for
-- admin-driven profile changes: phone (revokes verification + strips
-- _phone-suffixed auth_providers atomically) and location (state_id
-- swap). Both write to profile_admin_changes (the audit table from
-- E.2.15.0).
-- ============================================================
--
-- PRECEDENT — E.2.2.0 grant_admin_role / revoke_admin_role:
--   SECURITY DEFINER + SET search_path = public + REVOKE EXECUTE FROM
--   PUBLIC + targeted GRANT + transaction-local GUC bypass for the freeze
--   trigger + atomic audit-row INSERT inside the same transaction.
--   Same shape here.
--
-- INLINE-REVOKE PATTERN (vs. a separate revoke_phone_verified sibling):
--   The phone-change RPC strips phone_verified + the _phone-suffixed
--   auth_providers atomically inside the same UPDATE that writes the new
--   phone. Avoids a two-step "first revoke, then write" surface where
--   the profile could be observably in {old phone + verified} or {new
--   phone + verified} state for any duration. Single UPDATE = no
--   intermediate observable state. (Investigation §10 recommendation.)
--
-- AUTHORIZATION (defense in depth):
--   App layer: requireAdmin() in the calling server action.
--   DB layer:  in-function public.is_admin(p_granter_id) — raises 42501.
--   GRANT TO authenticated is intentional (the app calls from a regular
--   session); the in-function check enforces admin-only execution
--   regardless of who holds EXECUTE.
--
-- ACL LOCKDOWN — TRIPLE-REVOKE (anon + service_role + PUBLIC):
--   Supabase auto-grants EXECUTE on public functions to `anon`,
--   `authenticated`, AND `service_role` by default. `REVOKE FROM PUBLIC`
--   alone does NOT remove those role-specific grants — this was the
--   E.2.1.1 §2d lockdown gap (`mark_phone_verified`, commit 13bf8d4)
--   and we re-verified the same shape live for E.2.16.0 tonight.
--   The migration file MUST carry the explicit `REVOKE FROM anon,
--   service_role` lines so a fresh-DB replay lands at the same
--   locked-down ACL as production: `{postgres, authenticated}` only.
--
-- GUC BYPASS (phone only):
--   `app.profile_system_write_authorized` is the bypass key consumed by
--   the E.2.14.0 freeze trigger. `phone` is in the trigger's 8 protected
--   columns; without LOCAL set_config the UPDATE raises 42501.
--   `state_id` is NOT protected — the location RPC does not need the
--   GUC. (Location still routed through an RPC for audit uniformity
--   per the investigation §10.)
--
-- AUDIT VALUES (text-serialized):
--   action='phone_changed'    → previous/new = canonical phone (E.164 sans +)
--   action='location_changed' → previous/new = state NAME (human-readable
--     for admin surfaces; slug would be equally stable, name reads better)
--
-- EXECUTION (Supabase SQL Editor):
--   `RESET ROLE;` first. Then §0 paste back, §1 BEGIN..COMMIT, §2 paste
--   back. §2 controls are ROLLBACK-wrapped so verification leaves no
--   residue.


-- ============================================================
-- SECTION 0 — PRE-FLIGHT (read-only; run + paste first)
-- ============================================================
-- Expect:
--   profile_admin_changes_exists       = true   (Step 1 / E.2.15.0)
--   admin_change_user_phone_exists     = false  (this migration creates it)
--   admin_change_user_location_exists  = false  (this migration creates it)
--   nigerian_states_exists             = true   (FK target / validation)
--   is_admin_helper_exists             = true   (authz check)
--   freeze_trigger_exists              = true   (E.2.14.0 — must still be in place)
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='profile_admin_changes')        AS profile_admin_changes_exists,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='admin_change_user_phone')          AS admin_change_user_phone_exists,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='admin_change_user_location')       AS admin_change_user_location_exists,
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='nigerian_states')              AS nigerian_states_exists,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='is_admin')                         AS is_admin_helper_exists,
  EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='profiles'
            AND t.tgname='profiles_freeze_protected' AND NOT t.tgisinternal)         AS freeze_trigger_exists;


-- ============================================================
-- SECTION 1 — MIGRATION (one transaction)
-- ============================================================
-- Run as `postgres` (RESET ROLE; in the SQL Editor first).
BEGIN;

-- ----- 1. admin_change_user_phone -----
CREATE OR REPLACE FUNCTION public.admin_change_user_phone(
  p_target_user_id uuid,
  p_new_phone      text,
  p_granter_id     uuid,
  p_reason         text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_phone text;
BEGIN
  -- 1. Authorization (defense in depth — app layer also gates).
  IF NOT public.is_admin(p_granter_id) THEN
    RAISE EXCEPTION 'insufficient_privilege: caller is not an admin'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Reason length (5..500).
  IF length(trim(coalesce(p_reason, ''))) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'reason must be between 5 and 500 characters'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Phone format — canonical NG E.164 sans + (matches the
  -- businesses.seller_whatsapp CHECK from E.2.11.0).
  IF p_new_phone IS NULL OR p_new_phone !~ '^234\d{10}$' THEN
    RAISE EXCEPTION 'invalid phone format: must match ^234\d{10}$'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Read OLD phone; assert target exists.
  SELECT phone INTO v_old_phone
  FROM public.profiles
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target user not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- 5. Idempotency. Same number = no-op: no verification revoke,
  -- no audit row, no GUC set (the freeze trigger never fires).
  IF v_old_phone = p_new_phone THEN
    RETURN false;
  END IF;

  -- 6. Bypass GUC (LOCAL — transaction-scoped) so the E.2.14.0
  -- freeze_profile_protected_columns trigger lets this UPDATE through.
  -- Mirrors E.2.2.0's app.role_change_authorized precedent.
  PERFORM set_config('app.profile_system_write_authorized', 'true', true);

  -- 7. Atomic UPDATE: new phone + revoke phone_verified + strip the
  -- _phone-suffixed auth_providers + bump updated_at. Wrapped in an
  -- EXCEPTION block so we re-raise UNIQUE violations with a clearer
  -- operator-facing message. Note: '%\_phone' ESCAPE '\' matches the
  -- literal suffix _phone only (e.g. 'arkesel_phone'); without the
  -- escape, '_' is a single-char wildcard and would over-match.
  BEGIN
    UPDATE public.profiles
    SET phone               = p_new_phone,
        verification_status = array_remove(verification_status, 'phone_verified'),
        auth_providers      = ARRAY(
          SELECT x FROM unnest(auth_providers) AS x
          WHERE x NOT LIKE '%\_phone' ESCAPE '\'
        ),
        updated_at          = now()
    WHERE id = p_target_user_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'phone number already in use by another account'
        USING ERRCODE = '23505';
  END;

  -- 8. Audit row. SECURITY DEFINER bypasses RLS — profile_admin_changes
  -- has no INSERT policy by design; this RPC is the write path.
  INSERT INTO public.profile_admin_changes
    (target_user_id, granter_id, action, previous_value, new_value, reason)
  VALUES
    (p_target_user_id, p_granter_id, 'phone_changed', v_old_phone, p_new_phone, p_reason);

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.admin_change_user_phone(uuid, text, uuid, text) IS
  'E.2.16.0 / Stage 1 admin tools Step 2. Admin-driven phone change. Validates caller-is-admin (42501), reason length 5..500 (22023), phone format ^234\d{10}$ (22023). No-ops on same value (no audit). Sets app.profile_system_write_authorized LOCAL, atomically writes new phone + strips phone_verified + strips _phone-suffixed auth_providers, INSERTs profile_admin_changes audit row. UNIQUE collision → 23505 with clearer message. SECURITY DEFINER, search_path=public. EXECUTE locked down: REVOKE FROM PUBLIC + anon + service_role, GRANT to authenticated only (in-function is_admin enforces actual authz).';

-- ACL lockdown. Supabase auto-grants EXECUTE to anon/authenticated/
-- service_role on public functions; REVOKE FROM PUBLIC alone does NOT
-- remove the role-specific grants. Explicit triple-REVOKE matches
-- E.2.1.1 §2d precedent and the live-fire ACL verified for this RPC.
REVOKE EXECUTE ON FUNCTION public.admin_change_user_phone(uuid, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_change_user_phone(uuid, text, uuid, text) FROM anon, service_role;
GRANT  EXECUTE ON FUNCTION public.admin_change_user_phone(uuid, text, uuid, text) TO   authenticated;


-- ----- 2. admin_change_user_location -----
CREATE OR REPLACE FUNCTION public.admin_change_user_location(
  p_target_user_id uuid,
  p_new_state_id   uuid,
  p_granter_id     uuid,
  p_reason         text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_state_id  uuid;
  v_old_state_nm  text;
  v_new_state_nm  text;
BEGIN
  -- 1. Authorization.
  IF NOT public.is_admin(p_granter_id) THEN
    RAISE EXCEPTION 'insufficient_privilege: caller is not an admin'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Reason length.
  IF length(trim(coalesce(p_reason, ''))) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'reason must be between 5 and 500 characters'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Defense-in-depth state existence check + capture new name in one
  -- shot. The FK on profiles.state_id would also catch a bad uuid at
  -- UPDATE time, but validating up-front yields a cleaner error and
  -- reads the display name for the audit row.
  SELECT name INTO v_new_state_nm
  FROM public.nigerian_states
  WHERE id = p_new_state_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'state_id not found in nigerian_states'
      USING ERRCODE = 'P0002';
  END IF;

  -- 4. Read OLD state_id + display name (NULL-safe via LEFT JOIN — the
  -- target's state_id may be NULL).
  SELECT p.state_id, ns.name
    INTO v_old_state_id, v_old_state_nm
  FROM public.profiles p
  LEFT JOIN public.nigerian_states ns ON ns.id = p.state_id
  WHERE p.id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target user not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- 5. Idempotency — NULL-safe (IS NOT DISTINCT FROM treats NULL=NULL
  -- as a match, so re-saving an unset location no-ops cleanly).
  IF v_old_state_id IS NOT DISTINCT FROM p_new_state_id THEN
    RETURN false;
  END IF;

  -- 6. No GUC needed — state_id is NOT in the E.2.14.0 protected set.

  -- 7. UPDATE.
  UPDATE public.profiles
  SET state_id   = p_new_state_id,
      updated_at = now()
  WHERE id = p_target_user_id;

  -- 8. Audit. previous_value carries OLD name (NULL if profile had no
  -- state set); new_value carries NEW name. Names, not uuids — admin
  -- surfaces want human-readable.
  INSERT INTO public.profile_admin_changes
    (target_user_id, granter_id, action, previous_value, new_value, reason)
  VALUES
    (p_target_user_id, p_granter_id, 'location_changed', v_old_state_nm, v_new_state_nm, p_reason);

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.admin_change_user_location(uuid, uuid, uuid, text) IS
  'E.2.16.0 / Stage 1 admin tools Step 2. Admin-driven state_id change. Validates caller-is-admin (42501), reason length 5..500 (22023), state existence (P0002). NULL-safe idempotency on same state_id (no audit). state_id is NOT in the E.2.14.0 freeze list so no bypass GUC needed; routed through this RPC purely for audit + admin-tool consistency (investigation §10). Audit row carries state NAME (not uuid) for human-readable admin surfaces. SECURITY DEFINER, search_path=public. EXECUTE locked down: REVOKE FROM PUBLIC + anon + service_role, GRANT to authenticated only.';

-- ACL lockdown — same triple-REVOKE shape as admin_change_user_phone.
REVOKE EXECUTE ON FUNCTION public.admin_change_user_location(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_change_user_location(uuid, uuid, uuid, text) FROM anon, service_role;
GRANT  EXECUTE ON FUNCTION public.admin_change_user_location(uuid, uuid, uuid, text) TO   authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- SECTION 2 — VERIFICATION (structural + ROLLBACK-wrapped controls)
-- ============================================================

-- 2a. Both functions exist; SECURITY DEFINER; search_path pinned.
SELECT
  p.proname,
  p.prosecdef AS is_security_definer,
  p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('admin_change_user_phone', 'admin_change_user_location')
ORDER BY p.proname;

-- 2b. EXECUTE ACL — only postgres (owner) + authenticated. No anon, no
-- service_role, no PUBLIC entry.
SELECT p.proname, p.proacl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('admin_change_user_phone', 'admin_change_user_location')
ORDER BY p.proname;

-- ----- Live-fire controls (ROLLBACK-wrapped — no residue) -----
-- Substitute these in the SQL Editor before running:
--   :admin_id     profiles.id with role='admin'
--   :nonadmin_id  profiles.id with role distinct from 'admin'
--   :target_id    a third profiles.id (subject of the change)
--   :other_state  nigerian_states.id different from target's current
--   :bogus_state  '00000000-0000-0000-0000-000000000000'::uuid

-- 2c. POSITIVE — phone. Admin, valid inputs.
BEGIN;
  SELECT public.admin_change_user_phone(
    :target_id, '2349099999999', :admin_id,
    'Buyer requested update via support ticket #1234'
  ) AS returned_true_expected;
  SELECT phone, verification_status, auth_providers
  FROM public.profiles WHERE id = :target_id;
  SELECT action, previous_value, new_value, reason, granter_id
  FROM public.profile_admin_changes
  WHERE target_user_id = :target_id
  ORDER BY created_at DESC LIMIT 1;
ROLLBACK;

-- 2d. NEGATIVE — non-admin caller (phone). Expect 42501.
BEGIN;
  SELECT public.admin_change_user_phone(
    :target_id, '2349099999999', :nonadmin_id,
    'attempting unauthorized change'
  );
ROLLBACK;

-- 2e. NEGATIVE — invalid phone format. Expect 22023.
BEGIN;
  SELECT public.admin_change_user_phone(
    :target_id, '08012345678', :admin_id, 'should fail format check'
  );
ROLLBACK;

-- 2f. NEGATIVE — reason too short (phone). Expect 22023.
BEGIN;
  SELECT public.admin_change_user_phone(
    :target_id, '2349099999999', :admin_id, 'hi'
  );
ROLLBACK;

-- 2g. IDEMPOTENCY — same phone. Expect false; no verification revoke; no audit row.
BEGIN;
  SELECT phone AS pre_phone, verification_status AS pre_vs
  FROM public.profiles WHERE id = :target_id;
  SELECT public.admin_change_user_phone(
    :target_id,
    (SELECT phone FROM public.profiles WHERE id = :target_id),
    :admin_id,
    'Phone idempotency probe — should no-op'
  ) AS returned_false_expected;
  SELECT count(*) AS should_be_zero
  FROM public.profile_admin_changes
  WHERE target_user_id = :target_id
    AND reason = 'Phone idempotency probe — should no-op';
  SELECT phone AS post_phone, verification_status AS post_vs
  FROM public.profiles WHERE id = :target_id;
ROLLBACK;

-- 2h. POSITIVE — location. Admin, valid inputs.
BEGIN;
  SELECT public.admin_change_user_location(
    :target_id, :other_state, :admin_id,
    'Buyer moved — verified by phone callback'
  ) AS returned_true_expected;
  SELECT state_id FROM public.profiles WHERE id = :target_id;
  SELECT action, previous_value, new_value, reason, granter_id
  FROM public.profile_admin_changes
  WHERE target_user_id = :target_id
  ORDER BY created_at DESC LIMIT 1;
ROLLBACK;

-- 2i. NEGATIVE — non-admin caller (location). Expect 42501.
BEGIN;
  SELECT public.admin_change_user_location(
    :target_id, :other_state, :nonadmin_id,
    'attempting unauthorized location change'
  );
ROLLBACK;

-- 2j. NEGATIVE — bogus state_id. Expect P0002.
BEGIN;
  SELECT public.admin_change_user_location(
    :target_id, :bogus_state, :admin_id,
    'should fail state_id existence check'
  );
ROLLBACK;

-- 2k. IDEMPOTENCY — same state_id. Expect false; no audit row.
BEGIN;
  SELECT public.admin_change_user_location(
    :target_id,
    (SELECT state_id FROM public.profiles WHERE id = :target_id),
    :admin_id,
    'Location idempotency probe'
  ) AS returned_false_expected;
  SELECT count(*) AS should_be_zero
  FROM public.profile_admin_changes
  WHERE target_user_id = :target_id
    AND reason = 'Location idempotency probe';
ROLLBACK;

-- 2l. NEGATIVE — reason too short (location). Expect 22023.
BEGIN;
  SELECT public.admin_change_user_location(
    :target_id, :other_state, :admin_id, 'no'
  );
ROLLBACK;

-- ============================================================
-- END OF E.2.16.0
-- ============================================================
