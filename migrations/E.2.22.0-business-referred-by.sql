-- ============================================================
-- E.2.22.0-business-referred-by.sql
-- Feature U slice 1 — "Referred by" capture at seller signup.
--
-- Adds a nullable free-text column to public.businesses to record
-- the name of a referring seller, as entered by the new seller at
-- signup. Optional field — never blocks signup. Admin-only display
-- surface (extends the Feature R registration-details panel on
-- /admin/verifications/[id]). Never surfaced to buyers or on the
-- public seller shop.
--
-- NOT a referral-code system. No FK to a referring seller row, no
-- generated codes, no linkage logic, no validation against the
-- existing seller registry. The founder reads the free-text name
-- in the admin panel and reconciles by hand at current scale.
-- A future Feature U-B can introduce structured referral codes if
-- the scale ever justifies it.
--
-- STORAGE SHAPE:
--   referred_by_name  text  NULLABLE
--   - Trimmed at the application layer before INSERT.
--   - Empty/whitespace-only inputs persist as NULL, not '' — so the
--     admin display can use a simple truthiness gate.
--   - Length-capped at 100 characters at the application layer
--     (mirrors business_name max). No DB-level CHECK constraint
--     because the column is free-text reference data, not a key
--     or invariant — application-level validation is sufficient.
--
-- SECURITY POSTURE: treated as untrusted user input throughout
-- (same as business_name). Stored verbatim. RLS on `businesses`
-- already covers reads — no policy change needed; the existing
-- public-read and owner-write policies extend to the new column
-- automatically.
--
-- TO APPLY: run as `postgres` (RESET ROLE; in the SQL Editor first).
-- ============================================================

BEGIN;

ALTER TABLE public.businesses
  ADD COLUMN referred_by_name text;

COMMENT ON COLUMN public.businesses.referred_by_name IS
  'Feature U slice 1. Free-text shop/business name of the referring seller, as entered by the new seller at signup. Optional. NULL when not provided. Trimmed + length-capped (100) at the application layer. Admin-only display surface — never rendered to buyers or on the public seller shop. NOT a referral-code system; future Feature U-B may add structured codes if scale justifies.';

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- SECTION 2 — VERIFICATION (post-apply, run separately)
-- ============================================================

-- 2a. Column exists with expected shape.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'businesses'
  AND column_name  = 'referred_by_name';
-- Expected: 1 row — referred_by_name | text | YES | NULL

-- 2b. Comment landed.
SELECT pg_catalog.col_description(
  ('public.businesses'::regclass)::oid,
  (SELECT ordinal_position FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='businesses'
      AND column_name='referred_by_name')
) AS column_comment;
-- Expected: the COMMENT ON COLUMN text above.

-- 2c. All existing rows backfilled to NULL (no surprise default).
SELECT
  count(*)                                            AS total_businesses,
  count(*) FILTER (WHERE referred_by_name IS NULL)    AS referred_by_null,
  count(*) FILTER (WHERE referred_by_name IS NOT NULL) AS referred_by_set
FROM public.businesses;
-- Expected: total = null (all pre-existing rows); set = 0 (no backfill data).
