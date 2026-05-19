-- ============================================================
-- D-080-prep-audit.sql
-- Pre-flight audit for the D-080 maintenance window
-- ============================================================
--
-- READ-ONLY. No DDL. Five sections of SELECT queries that surface
-- the cosmetic-Phase-A→Phase-E hygiene drift D-080's scope covers:
--
--   1. Stale FK constraint names (column-rename artifacts)
--   2. Stale index names (column-rename artifacts)
--   3. Dead enum types with zero remaining column references
--   4. Ordinal-position gaps on reshaped tables (informational only)
--   5. pg_proc scan for function bodies referencing renamed columns
--
-- Execution discipline:
--   - Run each section independently in Supabase SQL Editor
--   - Paste verbatim output back to Frank/agent for review
--   - DO NOT execute any rename/drop based on this audit alone — the
--     maintenance migration ships separately as Sprint 2.6 once outputs
--     are reviewed and approved
--   - Verify "No limit" toggle is OFF in SQL Editor before running V5
--     (the aggregate function in V5 needs explicit handling)
--
-- Column renames in scope (from E.1.0 / E.1.1):
--   profiles.whatsapp_number  →  phone           (E.1.0)
--   subscriptions.profile_id  →  user_id         (E.1.1)
--   contact_reveals.product_id →  listing_id     (E.1.1)
--
-- Tables with reshape ordinal gaps (informational, no fix needed):
--   subscriptions    (gaps at positions 3/4/5/6/7/10/11/13)
--   contact_reveals  (gaps at positions 5/6/7)
--
-- ============================================================

-- ============================================================
-- SECTION 1 — FK CONSTRAINT NAME AUDIT
-- ============================================================
-- Catches constraint names still embedding old column names after
-- column renames. Per D-080: Postgres updates the constraint's column
-- reference automatically, but the constraint NAME survives. Renaming
-- requires DROP + ADD inside a transaction (briefly loses FK
-- enforcement) — deferred to dedicated maintenance window.
--
-- Known-stale targets surfaced during E.1.1 schema-refresh dump:
--   contact_reveals_product_id_products_id_fk
--     → references column now named `listing_id`
--   subscriptions_profile_id_profiles_id_fk
--     → references column now named `user_id`
--
-- Also surfaces the D-080 catch-all expansion target:
--   filter_actions_log_rule_id_filter_rules_id_fk
--     → Drizzle-style _fk naming, should be _fkey for Phase E consistency
--
-- Expected outcome: 3 rows (the two above + filter_actions_log FK).
-- Each row: current constraint name, table, column, target table+column.

SELECT
  tc.constraint_name           AS current_name,
  tc.table_name                AS owning_table,
  kcu.column_name              AS current_column_name,
  ccu.table_name               AS references_table,
  ccu.column_name              AS references_column,
  rc.delete_rule               AS on_delete
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
 AND tc.table_schema = rc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND (
    -- Embedded old column names from E.1.0 / E.1.1 renames
    tc.constraint_name ILIKE '%whatsapp_number%'
    OR tc.constraint_name ILIKE '%profile_id_profiles%'
    OR tc.constraint_name ILIKE '%product_id_products%'
    -- Phase E Drizzle _fk style that should be _fkey (D-080 expansion)
    OR tc.constraint_name = 'filter_actions_log_rule_id_filter_rules_id_fk'
  )
ORDER BY tc.table_name, tc.constraint_name;


-- ============================================================
-- SECTION 2 — INDEX NAME AUDIT
-- ============================================================
-- Catches index names still embedding old column names. Per D-069
-- (absorbed into D-080's catch-all scope): Postgres updates the index
-- column reference automatically but the index NAME survives. Renaming
-- requires CREATE INDEX CONCURRENTLY + DROP INDEX cycle.
--
-- E.1.2 already dropped the most obvious orphan (`subscriptions_profile_idx`)
-- as cleanup. This query catches any survivors.
--
-- Expected outcome: 0 rows. If any rows surface, investigate before
-- the maintenance migration ships.

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    indexname ILIKE '%whatsapp_number%'
    OR indexname ILIKE '%profile_id%'
    OR (indexname ILIKE '%product_id%' AND tablename = 'contact_reveals')
  )
ORDER BY tablename, indexname;


-- ============================================================
-- SECTION 3 — DEAD ENUM TYPE AUDIT
-- ============================================================
-- Per D-080 catch-all expansion: Phase A enum types that have no
-- remaining column references can be DROP TYPE'd in the maintenance
-- migration. Known targets:
--
--   subscription_tier    — superseded by subscriptions.plan_code (TEXT) post-E.1.1
--   subscription_status  — superseded by subscriptions.status (TEXT) post-E.1.1
--
-- This query returns the enum type + column count using it. Drop is
-- safe ONLY when column_count = 0.
--
-- Expected outcome: 2 rows, both with column_count = 0.
-- If column_count > 0 for either, DO NOT DROP — investigate first.

WITH enum_types AS (
  SELECT
    t.typname AS enum_name,
    t.oid    AS enum_oid
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typtype = 'e'   -- enum
    AND t.typname IN ('subscription_tier', 'subscription_status')
)
SELECT
  e.enum_name,
  e.enum_oid,
  COALESCE(refs.column_count, 0) AS column_reference_count,
  CASE
    WHEN COALESCE(refs.column_count, 0) = 0 THEN '✅ SAFE TO DROP'
    ELSE '⚠️ STILL REFERENCED — investigate before dropping'
  END AS drop_safety
FROM enum_types e
LEFT JOIN (
  SELECT
    a.atttypid AS type_oid,
    COUNT(*)   AS column_count
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'auth')
    AND c.relkind = 'r'      -- ordinary table
    AND a.attnum > 0          -- exclude system columns
    AND NOT a.attisdropped
  GROUP BY a.atttypid
) refs ON refs.type_oid = e.enum_oid
ORDER BY e.enum_name;


-- ============================================================
-- SECTION 4 — ORDINAL-POSITION GAP DOCUMENTATION (INFORMATIONAL)
-- ============================================================
-- Per D-080 catch-all scope: cosmetic only. Documented in
-- ACTUAL_SCHEMA.md so future readers don't reference ordinal_position
-- from a tool query as if it were the column count. No fix required.
-- Postgres does not renumber surviving columns after DROP COLUMN.
--
-- This query surfaces the gap pattern so the audit output makes it
-- explicit. Reshape source: E.1.1 ALTER-in-place of subscriptions +
-- contact_reveals per D-055.
--
-- Expected outcome: subscriptions = 13 columns logical / max ordinal ~21;
--                   contact_reveals = 7 columns logical / max ordinal ~10.

SELECT
  table_name,
  COUNT(*)              AS logical_column_count,
  MIN(ordinal_position) AS min_ordinal,
  MAX(ordinal_position) AS max_ordinal,
  MAX(ordinal_position) - COUNT(*) AS dropped_columns_gap,
  array_agg(ordinal_position ORDER BY ordinal_position) AS ordinals_present
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('subscriptions', 'contact_reveals')
GROUP BY table_name
ORDER BY table_name;

-- NOTE on running Section 4: array_agg() may fail in Supabase SQL
-- Editor if the "No limit" toggle is enabled with default settings.
-- Per the MEMORY.md "Supabase SQL Editor: implicit LIMIT 100" lesson,
-- toggle "No limit" OFF, or rewrite as one row per (table, ordinal)
-- if the aggregate fails:
--
--   SELECT table_name, ordinal_position, column_name
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name IN ('subscriptions', 'contact_reveals')
--   ORDER BY table_name, ordinal_position;


-- ============================================================
-- SECTION 5 — pg_proc FUNCTION BODY SCAN
-- ============================================================
-- Per D-055 lesson (banked in MEMORY.md): Drizzle migrations don't
-- track function/trigger bodies, so the schema-refresh trio
-- (pg_proc + pg_indexes + pg_constraint) catches manual-cleanup cases
-- after column renames.
--
-- Postgres auto-rewrites column references in:
--   - RLS policy bodies (pg_policies.qual / with_check)
--   - CHECK constraint expressions
--   - Generated column expressions
--   - View definitions
--   - Function bodies that reference columns by name in STATIC SQL
--
-- Postgres does NOT auto-rewrite:
--   - Constraint NAMES (D-080 main scope, audited in Section 1)
--   - Index NAMES (Section 2)
--   - Function bodies that build SQL dynamically via format() / EXECUTE
--     / dollar-quoted string concatenation — this section catches those
--
-- Known patterns to surface:
--   - Functions whose source body contains the literal string
--     'whatsapp_number', 'profile_id', or 'product_id' AND belongs to
--     a context that touches the renamed tables
--   - Most matches will be FALSE POSITIVES (e.g., a comment, or a
--     generic 'profile_id' in a function on a different table) — review
--     each manually before deciding whether to fix
--
-- Expected outcome: 0 rows for actively-broken cases (E.1.0.1 hotfixed
-- handle_new_user). Any row that surfaces is a candidate for review.

SELECT
  n.nspname            AS schema_name,
  p.proname            AS function_name,
  p.prokind            AS kind,           -- 'f'=function, 'p'=procedure, 'a'=aggregate, 'w'=window
  p.prosecdef          AS security_definer,
  CASE
    WHEN pg_get_functiondef(p.oid) ILIKE '%whatsapp_number%' THEN 'whatsapp_number'
    WHEN pg_get_functiondef(p.oid) ILIKE '%profile_id%' THEN 'profile_id'
    WHEN pg_get_functiondef(p.oid) ILIKE '%product_id%' THEN 'product_id'
  END AS old_column_referenced,
  -- Extract the line containing the match for quick eyeballing.
  -- Limit to first 200 chars to keep output scannable.
  substring(
    pg_get_functiondef(p.oid),
    GREATEST(
      1,
      position(
        COALESCE(
          NULLIF(CASE WHEN pg_get_functiondef(p.oid) ILIKE '%whatsapp_number%' THEN 'whatsapp_number' END, ''),
          NULLIF(CASE WHEN pg_get_functiondef(p.oid) ILIKE '%profile_id%' THEN 'profile_id' END, ''),
          'product_id'
        ) IN pg_get_functiondef(p.oid)
      ) - 60
    ),
    200
  ) AS match_context
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    pg_get_functiondef(p.oid) ILIKE '%whatsapp_number%'
    OR pg_get_functiondef(p.oid) ILIKE '%profile_id%'
    OR pg_get_functiondef(p.oid) ILIKE '%product_id%'
  )
  -- Exclude functions we already know reference the old keys
  -- intentionally as COALESCE fallback (E.1.0.1 handle_new_user):
  AND p.proname NOT IN ('handle_new_user')
ORDER BY p.proname;


-- ============================================================
-- END OF AUDIT
-- ============================================================
-- Paste output of all 5 sections back for review.
-- DO NOT execute any rename or drop based on this output alone.
-- The maintenance migration (Sprint 2.6: D-080.1-maintenance.sql)
-- ships separately after Frank reviews the audit output.
