-- ============================================================
-- D-080.1-maintenance.sql
-- Phase E maintenance window — cosmetic schema hygiene
-- ============================================================
--
-- SCOPE (locked after D-080-prep-audit.sql Sections 1 + 3 reviewed):
--   - 2 FK constraint renames (names that LIE about their column)
--   - 2 dead enum DROP TYPE (zero column references)
--
-- Section 5 (pg_proc dynamic-SQL scan) was DEFERRED to a separate
-- diagnostic session — the Supabase SQL Editor repeatedly tripped the
-- "array_agg is an aggregate function" result-wrapper error on
-- pg_get_functiondef() bodies. Section 5 is risk-discovery only; a missed
-- stale reference fails LOUD at runtime ("column does not exist"), so
-- deferring it does not block these renames/drops.
--
-- ------------------------------------------------------------
-- WHY RENAME, NOT DROP+ADD
-- ------------------------------------------------------------
-- These two operations only change the constraint NAME — not its columns,
-- target, or ON DELETE rule. `ALTER TABLE ... RENAME CONSTRAINT` is a
-- catalog-only relabel:
--   * No FK-enforcement gap (the constraint is never dropped).
--   * No row re-validation (DROP+ADD would re-check every row on ADD).
--   * ON DELETE CASCADE is preserved automatically — the definition is
--     untouched, so there is no hand-retyped clause that could drift.
-- This is strictly safer than the DROP+ADD path the audit file originally
-- assumed. (Banked for MEMORY.md: a pure rename is RENAME CONSTRAINT;
-- reach for DROP+ADD only when the constraint DEFINITION actually changes.)
--
-- ------------------------------------------------------------
-- EXECUTION DISCIPLINE (Supabase SQL Editor)
-- ------------------------------------------------------------
--   - Paste this ENTIRE file. Confirm NO text is selected (blinking cursor
--     only) before clicking Run — partial execution of a BEGIN block is a
--     known trap (MEMORY.md).
--   - The whole thing is one BEGIN ... COMMIT. The inline DO-block
--     assertions RAISE EXCEPTION on any unexpected post-state, which aborts
--     the transaction (automatic ROLLBACK) BEFORE COMMIT is reached. So a
--     verification failure cannot leave a half-applied state.
--   - Supabase runs each submission in its own transaction; do NOT split
--     BEGIN and COMMIT across separate Run clicks (they won't share a
--     session). Run as one submission.
--
-- ------------------------------------------------------------
-- EMERGENCY ROLLBACK (inverse migration)
-- ------------------------------------------------------------
-- If a problem is discovered AFTER commit, the inverse is:
--
--   -- restore old FK constraint names
--   ALTER TABLE public.contact_reveals
--     RENAME CONSTRAINT contact_reveals_listing_id_products_id_fk
--                    TO contact_reveals_product_id_products_id_fk;
--   ALTER TABLE public.subscriptions
--     RENAME CONSTRAINT subscriptions_user_id_profiles_id_fk
--                    TO subscriptions_profile_id_profiles_id_fk;
--
--   -- recreate the dropped enum types (definition from Phase A schema).
--   -- NOTE: these enums had ZERO column references at drop time; recreating
--   -- the TYPE restores the type only, not any column binding (there was
--   -- none). Provided for completeness; unlikely to ever be needed.
--   CREATE TYPE public.subscription_status AS ENUM
--     ('active', 'canceled', 'past_due', 'trialing', 'incomplete');
--   CREATE TYPE public.subscription_tier AS ENUM
--     ('free', 'pro');
--   -- ^ VERIFY label sets against a Phase A schema dump before running a
--   --   rollback — the post-E.1.1 design abandoned these enums for TEXT
--   --   (plan_code / status), so exact historical labels are not load-
--   --   bearing for current code. Listed as best-effort reconstruction.
--
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- OP 1 — RENAME FK: contact_reveals (name lies about its column)
-- ------------------------------------------------------------
-- Audit evidence (D-080-prep-audit.sql Section 1, row 1):
--   constraint contact_reveals_product_id_products_id_fk
--   owns column `listing_id` (renamed from product_id in E.1.1)
--   references products(id), ON DELETE CASCADE.
-- The name embeds the dead column token `product_id`; the column is now
-- `listing_id`. Rename the name only; CASCADE preserved automatically.
ALTER TABLE public.contact_reveals
  RENAME CONSTRAINT contact_reveals_product_id_products_id_fk
                 TO contact_reveals_listing_id_products_id_fk;

-- ------------------------------------------------------------
-- OP 2 — RENAME FK: subscriptions (name lies about its column)
-- ------------------------------------------------------------
-- Audit evidence (D-080-prep-audit.sql Section 1, row 2):
--   constraint subscriptions_profile_id_profiles_id_fk
--   owns column `user_id` (renamed from profile_id in E.1.1)
--   references profiles(id), ON DELETE CASCADE.
-- The name embeds the dead column token `profile_id`; the column is now
-- `user_id`. Rename the name only; CASCADE preserved automatically.
ALTER TABLE public.subscriptions
  RENAME CONSTRAINT subscriptions_profile_id_profiles_id_fk
                 TO subscriptions_user_id_profiles_id_fk;

-- ------------------------------------------------------------
-- OP 3 — DROP TYPE: subscription_status (dead enum, 0 references)
-- ------------------------------------------------------------
-- Audit evidence (D-080-prep-audit.sql Section 3):
--   subscription_status — column_reference_count = 0 — SAFE TO DROP.
-- Superseded by subscriptions.status (TEXT) post-E.1.1.
-- Plain DROP TYPE (no CASCADE): if any reference somehow exists, this
-- errors and the whole transaction rolls back rather than silently
-- dropping a dependent column.
DROP TYPE public.subscription_status;

-- ------------------------------------------------------------
-- OP 4 — DROP TYPE: subscription_tier (dead enum, 0 references)
-- ------------------------------------------------------------
-- Audit evidence (D-080-prep-audit.sql Section 3):
--   subscription_tier — column_reference_count = 0 — SAFE TO DROP.
-- Superseded by subscriptions.plan_code (TEXT) post-E.1.1.
DROP TYPE public.subscription_tier;

-- ------------------------------------------------------------
-- INLINE VERIFICATION (self-enforcing — aborts on any mismatch)
-- ------------------------------------------------------------
-- Each check RAISEs EXCEPTION on failure, which rolls back the entire
-- transaction before COMMIT. If this block passes silently, all four
-- operations are confirmed correct.
DO $verify$
BEGIN
  -- 1. new contact_reveals FK exists, type FK, ON DELETE CASCADE ('c')
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.contact_reveals'::regclass
      AND conname  = 'contact_reveals_listing_id_products_id_fk'
      AND contype  = 'f'
      AND confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'VERIFY FAIL: contact_reveals_listing_id_products_id_fk missing or not ON DELETE CASCADE';
  END IF;

  -- 2. old contact_reveals FK name is gone
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contact_reveals_product_id_products_id_fk'
  ) THEN
    RAISE EXCEPTION 'VERIFY FAIL: old name contact_reveals_product_id_products_id_fk still present';
  END IF;

  -- 3. new subscriptions FK exists, type FK, ON DELETE CASCADE ('c')
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname  = 'subscriptions_user_id_profiles_id_fk'
      AND contype  = 'f'
      AND confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'VERIFY FAIL: subscriptions_user_id_profiles_id_fk missing or not ON DELETE CASCADE';
  END IF;

  -- 4. old subscriptions FK name is gone
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_profile_id_profiles_id_fk'
  ) THEN
    RAISE EXCEPTION 'VERIFY FAIL: old name subscriptions_profile_id_profiles_id_fk still present';
  END IF;

  -- 5. subscription_status enum is gone
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'subscription_status'
  ) THEN
    RAISE EXCEPTION 'VERIFY FAIL: subscription_status type still exists';
  END IF;

  -- 6. subscription_tier enum is gone
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'subscription_tier'
  ) THEN
    RAISE EXCEPTION 'VERIFY FAIL: subscription_tier type still exists';
  END IF;

  RAISE NOTICE 'D-080.1 verification passed: 2 FK renames + 2 enum drops confirmed.';
END
$verify$;

-- Human-readable post-state grid (returned to the editor for eyeballing).
-- Expect exactly 2 rows, both confdeltype 'c' (CASCADE), with the new names.
SELECT
  conrelid::regclass        AS owning_table,
  conname                   AS constraint_name,
  confrelid::regclass       AS references_table,
  confdeltype               AS on_delete_code  -- 'c' = CASCADE
FROM pg_constraint
WHERE conname IN (
  'contact_reveals_listing_id_products_id_fk',
  'subscriptions_user_id_profiles_id_fk'
)
ORDER BY conname;

-- Reload PostgREST schema cache so the renamed constraints / dropped types
-- propagate to the API layer immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- END OF D-080.1 MAINTENANCE MIGRATION
-- ============================================================
