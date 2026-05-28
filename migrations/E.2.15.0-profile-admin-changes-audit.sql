-- ============================================================
-- E.2.15.0-profile-admin-changes-audit.sql
-- Stage 1 admin tools (Step 1 of N) — audit table for admin actions
-- on profiles. Phone change + location change ship in Step 2's RPCs;
-- email / suspend / delete extensions ship in later stages.
-- ============================================================
--
-- Single additive change: CREATE TABLE profile_admin_changes + index +
-- RLS (admin-only SELECT; no write policy — RPCs in the next step
-- INSERT as SECURITY DEFINER owned by postgres, bypassing RLS).
--
-- WHY A NEW TABLE INSTEAD OF admin_action_log:
--   admin_action_log.admin_id FKs to the separated `admins` table
--   (Phase E §14 / D-081 future-state). No app code writes to `admins`,
--   and admin-model unification is deferred per D-081. Using
--   admin_action_log now would force a per-action `admins`-upsert
--   workaround for one feature and leave every other admin action still
--   unaudited. The proven precedent for "audit log of admin actions on a
--   profile" is `admin_role_changes` (E.2.2.0 / D-105) — also a
--   purpose-specific table avoiding `admins`, also using profiles.id as
--   the FK target. This table mirrors that shape exactly.
--
-- WHY ROUTE BOTH ACTIONS THROUGH AUDIT:
--   - Phone change: revokes phone_verified, writes new number — irreversible
--     consequence (the original number is lost). Audit gives recovery.
--   - Location change: lower-stakes (state_id is unfrozen, owner-writable),
--     but routed through audit anyway for consistency + so the admin tool
--     has a single shape per the §10 recommendation in the investigation.
--
-- CHECK CONSTRAINT EXTENSIBILITY:
--   The action enum starts with two values. Future stages extend via:
--     ALTER TABLE public.profile_admin_changes
--       DROP CONSTRAINT profile_admin_changes_action_check,
--       ADD CONSTRAINT profile_admin_changes_action_check
--         CHECK (action IN ('phone_changed','location_changed',
--                           'email_changed','account_suspended',
--                           'account_deleted', …));
--   Cheap; no data migration needed; values are simple text.
--
-- FK ON DELETE behavior — mirrors admin_role_changes (E.2.2.0):
--   target_user_id RESTRICT — audit history must not vanish on user
--     deletion (which is itself deferred per K-004; deletion will require
--     either explicit audit-archive logic or a future migration to
--     SET NULL these once we ship a real account-delete flow).
--   granter_id SET NULL — if the acting admin's profile is ever removed
--     (revoked + deleted), the audit row survives with an unknown granter.
--     The action's existence + reason + values are still recoverable.
--
-- previous_value / new_value as TEXT (not typed):
--   Both phone (text already) and location (state slug or name) fit.
--   Storing as text keeps the table generic for the future actions
--   (email is text; account_suspended is boolean serialized as text;
--   account_deleted has no value). NULL is allowed in both for the
--   account_deleted case (no "value" semantics).
--
-- REASON IS NOT NULL:
--   Admin must supply a reason for every action — non-negotiable hygiene
--   matching admin_role_changes (which makes reason TEXT NOT NULL too,
--   per E.2.2.0's CHECK CONSTRAINT on length there as well — we'll
--   enforce min-length in the RPCs, not at the schema level, mirroring
--   E.2.2.0 which leaves length checks to the SECURITY DEFINER fn body).
--
-- VERIFICATION NOTE (§2 below):
--   The original prep deck included INSERT-based positive + negative
--   controls (§2g/§2h). Those were Editor-only validation tests: under
--   the deployed RLS (no INSERT policy), every direct write attempt
--   hits 42501 insufficient_privilege BEFORE reaching the CHECK
--   constraint validation — which is exactly the design intent
--   (writes go through Step 2's SECURITY DEFINER RPCs, not direct INSERT).
--   The committed §2 below carries only structural + RLS checks; the
--   write-attempt tests are dropped because they don't translate to
--   the saved-file context cleanly.
--
-- EXECUTION (Supabase SQL Editor):
--   `RESET ROLE;` first (CREATE TABLE / RLS need postgres). Then run §0
--   (paste back), then §1 (entire BEGIN..COMMIT, no text selected),
--   then §2 (paste back).

-- ============================================================
-- SECTION 0 — PRE-FLIGHT (read-only; run + paste first)
-- ============================================================
-- Expect:
--   table_already_exists           = false
--   admin_role_changes_exists      = true   (sanity — we mirror this precedent)
--   is_admin_helper_exists         = true   (RLS policy calls it)
--   profiles_table_exists          = true   (FK target)
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='profile_admin_changes') AS table_already_exists,
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='admin_role_changes')    AS admin_role_changes_exists,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='is_admin')                  AS is_admin_helper_exists,
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='profiles')              AS profiles_table_exists;


-- ============================================================
-- SECTION 1 — MIGRATION (one transaction)
-- ============================================================
-- Run as `postgres` (RESET ROLE; in the SQL Editor first).
BEGIN;

-- ----- 1. Table -----
CREATE TABLE public.profile_admin_changes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Subject of the action. RESTRICT: audit history must not vanish if the
  -- user is ever deleted. (Account deletion isn't built — K-004 — but the
  -- FK behavior is forward-compatible: future delete flow will need to
  -- explicitly archive these rows before allowing the delete to proceed.)
  target_user_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,

  -- Acting admin. SET NULL: if the admin is later removed, the audit row
  -- survives with a NULL granter — the change itself remains documented
  -- (action + reason + values).
  granter_id      uuid                  REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Closed vocabulary, extended per future stages. The two values for Step 2
  -- (phone-change + location-change) are listed; later stages ALTER the
  -- CHECK to add 'email_changed', 'account_suspended', 'account_deleted'.
  action          text        NOT NULL,

  -- Pre/post values, free-form text. Both nullable to support future
  -- account_deleted (no value semantics). For Step 2:
  --   action='phone_changed'    → previous + new canonical phone (E.164 sans +)
  --   action='location_changed' → previous + new state slug or name
  previous_value  text,
  new_value       text,

  -- Admin-supplied free-text justification. NOT NULL enforced at schema;
  -- length checks (min ~5 chars, max ~500) live in the RPC body, mirroring
  -- E.2.2.0's grant_admin_role / revoke_admin_role discipline.
  reason          text        NOT NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT profile_admin_changes_action_check CHECK (
    action IN ('phone_changed', 'location_changed')
  )
);

COMMENT ON TABLE public.profile_admin_changes IS
  'Audit log of admin actions on profile fields. Mirrors admin_role_changes (E.2.2.0). Written ONLY by SECURITY DEFINER RPCs (admin_change_user_phone, admin_change_user_location — Step 2). RLS allows admin SELECT only; no write policy — all writes are RPC-mediated.';

-- ----- 2. Index for queue display -----
-- Per-user history fetch ordered newest-first (admin user-detail page
-- shows their recent admin-driven changes). Same shape as
-- admin_role_changes_target_user_id_idx (E.2.2.0).
CREATE INDEX profile_admin_changes_target_idx
  ON public.profile_admin_changes (target_user_id, created_at DESC);

-- ----- 3. RLS -----
-- Enabled with a single SELECT policy (admin-only). No INSERT / UPDATE /
-- DELETE policies — meaning regular session roles (authenticated, anon)
-- can never write to this table via PostgREST. RPCs in Step 2 INSERT
-- directly as SECURITY DEFINER owned by `postgres` (bypasses RLS).
ALTER TABLE public.profile_admin_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_admin_changes_admin_read"
  ON public.profile_admin_changes
  FOR SELECT
  USING (public.is_admin(auth.uid()));

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- SECTION 2 — VERIFICATION (read-only; run + paste after migrating)
-- ============================================================

-- 2a. Table + columns present, types correct.
--     Expect: 8 rows in this logical order.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profile_admin_changes'
ORDER BY ordinal_position;

-- 2b. CHECK constraint present with the two-value action enum + definition.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid='public.profile_admin_changes'::regclass
  AND conname='profile_admin_changes_action_check';

-- 2c. FK constraints — RESTRICT on target_user_id, SET NULL on granter_id.
--     confdeltype 'r' = RESTRICT; 'n' = SET NULL.
SELECT conname, confdeltype
FROM pg_constraint
WHERE conrelid='public.profile_admin_changes'::regclass
  AND contype='f'
ORDER BY conname;

-- 2d. Index present.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename='profile_admin_changes'
  AND indexname='profile_admin_changes_target_idx';

-- 2e. RLS enabled + exactly one policy (the admin SELECT policy).
SELECT
  c.relrowsecurity AS rls_enabled,
  (SELECT count(*) FROM pg_policies
   WHERE schemaname='public' AND tablename='profile_admin_changes') AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='profile_admin_changes';

-- 2f. The one policy is the admin SELECT policy with the expected predicate.
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname='public' AND tablename='profile_admin_changes';

-- 2g. Sanity — admin_role_changes is untouched (still present).
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='admin_role_changes') AS admin_role_changes_still_present;

-- ============================================================
-- END OF E.2.15.0
-- ============================================================
