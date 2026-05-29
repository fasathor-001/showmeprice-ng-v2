-- ============================================================
-- E.2.17.0-inventory-quantity.sql
-- Stage 1 inventory feature — Step 1 of 2 — DB foundation.
-- ============================================================
--
-- Adds:
--   1. categories.supports_inventory (boolean NOT NULL DEFAULT true)
--      — category-aware flag controlling whether the listing-creation UI
--      shows the quantity field and whether public surfaces render the
--      "Out of stock" badge.
--   2. products.quantity (integer NOT NULL DEFAULT 1)
--      + products_quantity_nonneg_check CHECK (quantity >= 0)
--      — per-listing stock count. Manual seller management (no auto-
--      decrement; D-129 — no purchase events on the platform yet).
--   3. Backfill UPDATE setting supports_inventory = false for the
--      7 confirmed single-instance + non-product slugs.
--
-- Step 2 (separate commit) ships the app code: validators, action parsing
-- + persistence, conditional form rendering, public-detail / dashboard /
-- marketplace badges. This migration provides the schema foundation only.
--
-- ============================================================
-- DESIGN CHOICES
-- ============================================================
--
-- WHY A BOOLEAN COLUMN INSTEAD OF categories.category_features JSONB:
--   The existing `category_features` JSONB column (Phase E.1.0) is reserved
--   for runtime UI tunables — warning banners, high-value markers, per-
--   category required-field hints. The inventory flag is a different
--   shape: it's a hard schema-level capability switch that gates form
--   rendering and display logic on every listing read. Reasons against
--   JSONB here:
--     - Frequent-path read. Every listing form render and every public
--       detail render needs to know the flag; a boolean column is cheaper
--       than `category_features->>'supports_inventory'` JSONB extraction.
--     - Type safety. Drizzle treats the column as `boolean`; the JSONB
--       path requires null-vs-missing handling and runtime coercion.
--     - Semantic clarity. `supports_inventory` is a schema-shape decision
--       (does this category have stock at all?), not a runtime UI tunable.
--       Mixing the two in JSONB blurs the boundary.
--   The JSONB path stays right for `warning_banner`, `high_value`, etc.
--   that genuinely vary per row and are display-only.
--
-- WHY NOT NULL DEFAULT 1 (not nullable with NULL = N/A) ON products.quantity:
--   The category flag (supports_inventory) is the source of truth for
--   "show or hide the quantity UI". The value itself never needs a null
--   sentinel because the visibility decision happens upstream. Choosing
--   NOT NULL DEFAULT 1:
--     - Render code reads `product.quantity` without null-check on every
--       detail / card / dashboard path.
--     - Backfills existing rows to 1 immediately and semantically (the
--       handful of existing listings each represent "the seller has 1 of
--       this item" — accurate by construction).
--     - Defense in depth: if a row ever ends up in a non-inventory
--       category with quantity = 0 (e.g. cross-category edit), the UI
--       still ignores it because category.supports_inventory = false.
--     - Migration is one ALTER with an immediate backfill; no two-step
--       "add nullable, backfill, ALTER NOT NULL" dance.
--   The CHECK >= 0 prevents negative values at the DB layer.
--
-- WHY STATUS AND QUANTITY ARE ORTHOGONAL (and out-of-stock listings stay
-- status='active'):
--   `status` (product_status enum: draft / active / sold / archived) is
--   SELLER INTENT — "I want this listing live" vs. "I'm done selling it".
--   `quantity` is CURRENT STOCK COUNT — "I have N right now".
--   Conflating them (auto-setting status='sold' when quantity hits 0)
--   would destroy the buyer-browsability case: a fashion seller who's
--   restocking next week wants buyers to still see the listing with an
--   "Out of stock" badge, message about availability, see their other
--   items. The setListingStatusAction (Gap B / sold-or-reactivate) stays
--   the SELLER's explicit lifecycle control; quantity stays the live
--   stock signal. Two axes.
--
-- WHY RLS IS NOT TOUCHED:
--   `products_public_read_active` filters on `status = 'active' AND
--   hidden_at IS NULL`. Because out-of-stock listings stay status='active'
--   (per the previous point), they remain visible to buyers; the "Out of
--   stock" badge is purely a UI layer on top of the existing visibility
--   policy. No policy changes; no buyer-facing query rewrites; no
--   migration to existing policies. Step 2's app code wires the badge
--   into existing render paths only.
--
-- WHY PRE-SEED `pets` AND `services` (CLOSED PER D-140) TO false NOW:
--   Both categories are in the D-140 denylist and cannot receive listings
--   today. But if/when either ever opens (a future services surface, a
--   pets surface with welfare/CITES verification), the UI policy should
--   already be correct on day one. `pets` = false because each animal is
--   a unique individual; `services` = false because services aren't
--   products and have no inventory concept. Banking the policy now
--   costs one UPDATE row each; not pre-seeding would mean a follow-up
--   migration later. Cheap to do; cheap not to forget.
--
-- WHY `vehicle-parts` STAYS true (DEPARTS FROM THE vehicles FAMILY):
--   Per founder confirmation: Nigerian parts vendors trend toward
--   stock-tracked inventory ("I have 10 of these used Camry windshields")
--   rather than single-instance posting ("this specific windshield").
--   Treating parts as inventory matches the operational reality of the
--   Nigerian parts vertical and is consistent with how Jiji and the other
--   majors classify the category. The other vehicles subs (cars,
--   motorcycles, tricycles) remain false — each individual vehicle is a
--   specific unit. The split is intentional.
--
-- ============================================================
-- EXECUTION (Supabase SQL Editor):
--   `RESET ROLE;` first (ALTER TABLE needs postgres). Then §0 paste back,
--   §1 BEGIN..COMMIT, §2 paste back. §2 controls are ROLLBACK-wrapped so
--   verification leaves no residue.


-- ============================================================
-- SECTION 0 — PRE-FLIGHT (read-only; run + paste first)
-- ============================================================
-- Expect:
--   supports_inventory_column_exists   = false  (this migration creates it)
--   quantity_column_exists             = false  (this migration creates it)
--   quantity_check_exists              = false  (this migration creates it)
--   categories_table_exists            = true
--   products_table_exists              = true
--   target_slugs_present_count         = 7      (vehicles, cars, motorcycles,
--                                                tricycles, property, pets,
--                                                services — all must exist)
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='categories'
      AND column_name='supports_inventory'
  ) AS supports_inventory_column_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='products'
      AND column_name='quantity'
  ) AS quantity_column_exists,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='products_quantity_nonneg_check'
      AND conrelid='public.products'::regclass
  ) AS quantity_check_exists,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='categories'
  ) AS categories_table_exists,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='products'
  ) AS products_table_exists,
  (
    SELECT count(*) FROM public.categories
    WHERE slug IN (
      'vehicles', 'cars', 'motorcycles', 'tricycles',
      'property', 'pets', 'services'
    )
  ) AS target_slugs_present_count;

-- Defensive — list the target slugs that ARE present (should match the
-- 7-row count above). If any are missing, the seed taxonomy has drifted
-- and §1's UPDATE will silently update fewer than 7 rows.
SELECT slug
FROM public.categories
WHERE slug IN (
  'vehicles', 'cars', 'motorcycles', 'tricycles',
  'property', 'pets', 'services'
)
ORDER BY slug;


-- ============================================================
-- SECTION 1 — MIGRATION (one transaction)
-- ============================================================
-- Run as `postgres` (RESET ROLE; in the SQL Editor first).
BEGIN;

-- ----- 1. categories.supports_inventory -----
-- Boolean NOT NULL DEFAULT true. All ~108 existing category rows backfill
-- to TRUE immediately; the 7-row backfill below flips the closed set.
ALTER TABLE public.categories
  ADD COLUMN supports_inventory boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.categories.supports_inventory IS
  'E.2.17.0 — Whether this category supports per-listing quantity tracking. true (default) = listing-creation UI shows the quantity field and public surfaces render the "Out of stock" badge when product.quantity=0. false = quantity field hidden in the form and badge suppressed in display (single-instance categories like vehicles/property; categorically-no-inventory like pets/services). Schema-shape flag, not a runtime UI tunable — distinct from category_features JSONB.';

-- ----- 2. Backfill the 7 hard-false slugs -----
-- Single-instance vehicle categories (cars, motorcycles, tricycles) +
-- vehicles parent + property + the two D-140-closed categories where the
-- policy is pre-seeded (pets, services). vehicle-parts deliberately
-- omitted — stays true per founder confirmation (NG parts vendors stock
-- multiple identical units).
UPDATE public.categories
SET supports_inventory = false
WHERE slug IN (
  'vehicles',
  'cars',
  'motorcycles',
  'tricycles',
  'property',
  'pets',
  'services'
);

-- ----- 3. products.quantity + CHECK constraint -----
-- NOT NULL DEFAULT 1: backfills every existing product row to 1
-- semantically ("seller has 1 of this item"). CHECK (quantity >= 0)
-- enforced at the DB; app-layer validateQuantity in Step 2 reinforces.
ALTER TABLE public.products
  ADD COLUMN quantity integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT products_quantity_nonneg_check CHECK (quantity >= 0);

COMMENT ON COLUMN public.products.quantity IS
  'E.2.17.0 — Per-listing stock count. NOT NULL DEFAULT 1. Manually managed by the seller (no auto-decrement; the platform has no purchase events per D-129). UI visibility gated by the listing''s category.supports_inventory flag — non-inventory categories ignore this value entirely. quantity=0 surfaces as the "Out of stock" badge on public surfaces while the listing stays status=''active'' for buyer browsability (status and quantity are orthogonal — status = seller intent, quantity = current stock).';

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- SECTION 2 — VERIFICATION (read-only structural + data + controls)
-- ============================================================

-- 2a. categories.supports_inventory — column shape verified.
--     Expect: data_type='boolean', is_nullable='NO', column_default='true'.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='categories'
  AND column_name='supports_inventory';

-- 2b. products.quantity — column shape verified.
--     Expect: data_type='integer', is_nullable='NO', column_default='1'.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='products'
  AND column_name='quantity';

-- 2c. products_quantity_nonneg_check — CHECK constraint definition.
--     Expect: definition = 'CHECK ((quantity >= 0))' (or pg-canonical form).
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname='products_quantity_nonneg_check'
  AND conrelid='public.products'::regclass;

-- 2d. Exactly 7 categories with supports_inventory = false.
--     Expect: count = 7, slugs in alphabetical order:
--     cars, motorcycles, pets, property, services, tricycles, vehicles.
SELECT count(*) AS false_count FROM public.categories WHERE supports_inventory = false;

SELECT slug, supports_inventory
FROM public.categories
WHERE supports_inventory = false
ORDER BY slug;

-- 2e. All other categories carry supports_inventory = true.
--     Expect: 0 rows (no surprise NULLs; column is NOT NULL).
SELECT slug
FROM public.categories
WHERE supports_inventory IS NULL
   OR (supports_inventory = false
       AND slug NOT IN (
         'vehicles', 'cars', 'motorcycles', 'tricycles',
         'property', 'pets', 'services'
       ));

-- 2f. Sanity-check vehicle-parts stayed true (key departure from the
--     vehicles family).
--     Expect: 1 row, supports_inventory = true.
SELECT slug, supports_inventory
FROM public.categories
WHERE slug = 'vehicle-parts';

-- 2g. Existing products all backfilled to quantity = 1.
--     Expect: zero_count = 0, total_count matches the pre-migration row count.
SELECT
  (SELECT count(*) FROM public.products WHERE quantity != 1) AS not_one_count,
  (SELECT count(*) FROM public.products) AS total_products;

-- 2h. RLS policies on `products` unchanged — same 6 policies present, no
--     drops, no additions.
--     Expect: 6 rows: products_admin_all, products_public_read_active,
--     products_seller_delete, products_seller_insert,
--     products_seller_read_own, products_seller_update.
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname='public' AND tablename='products'
ORDER BY policyname;

-- ----- Live-fire controls (ROLLBACK-wrapped — no residue) -----
-- Each control INSERT clones business_id + seller_id + currency from an
-- existing products row to satisfy NOT NULL + FK constraints without
-- needing operator substitution. Requires at least one row in products
-- (confirmed: 5 verified sellers with at least one listing as of
-- 2026-05-29). If `products` is empty, these controls degrade silently —
-- skip the control block in that case.

-- 2i. POSITIVE — INSERT a product with quantity=5 succeeds.
--     Expect: 1 row returned with quantity=5; CHECK passes.
BEGIN;
  INSERT INTO public.products (
    business_id, seller_id, slug, title, description,
    price_kobo, status, quantity
  )
  SELECT
    business_id, seller_id,
    'qty-control-pos-' || gen_random_uuid()::text,
    'qty control positive',
    'control insert for E.2.17.0 quantity CHECK verification',
    100000, 'draft', 5
  FROM public.products
  LIMIT 1
  RETURNING id, slug, quantity, status;
ROLLBACK;

-- 2j. NEGATIVE — INSERT a product with quantity=-1 fails (CHECK violation).
--     Expect: ERROR 23514 check_violation against
--     products_quantity_nonneg_check.
BEGIN;
  INSERT INTO public.products (
    business_id, seller_id, slug, title, description,
    price_kobo, status, quantity
  )
  SELECT
    business_id, seller_id,
    'qty-control-neg-' || gen_random_uuid()::text,
    'qty control negative',
    'control insert for E.2.17.0 quantity CHECK verification',
    100000, 'draft', -1
  FROM public.products
  LIMIT 1;
ROLLBACK;

-- 2k. POSITIVE — UPDATE existing product to quantity=0 succeeds.
--     This is the out-of-stock state: legal, expected, badge-rendered
--     in Step 2's UI.
--     Expect: 1 row updated, quantity = 0.
BEGIN;
  UPDATE public.products
  SET quantity = 0
  WHERE id = (SELECT id FROM public.products LIMIT 1)
  RETURNING id, quantity, status;
ROLLBACK;

-- ============================================================
-- END OF E.2.17.0
-- ============================================================
