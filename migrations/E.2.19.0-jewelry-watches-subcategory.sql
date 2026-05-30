-- ============================================================
-- E.2.19.0-jewelry-watches-subcategory.sql
-- Feature B — Jewelry & Watches subcategory under Fashion.
-- ============================================================
--
-- Single data-row INSERT adding `jewelry-watches` as the 7th
-- subcategory under the existing `fashion` parent. Fulfills a fashion
-- seller's promised request from 2026-05-29 (yesterday) for a dedicated
-- jewelry category, expanded today per founder call to include watches
-- so the new subcategory covers the full personal-adornment shopping
-- intent for the Nigerian market.
--
-- ============================================================
-- DESIGN CHOICES
-- ============================================================
--
-- WHY THIS SUBCATEGORY (jewelry+watches pairing):
--   The fashion seller asked for a jewelry category yesterday. Watches
--   are a real Nigerian market (luxury and everyday — Rolex, Tag Heuer,
--   Casio, Citizen all sell well) and pair naturally with jewelry under
--   "personal adornment" shopping intent: a buyer browsing for a chain
--   is plausibly also browsing for a watch. Combining into one sub
--   keeps the taxonomy lean (no need for a second new row for watches)
--   without semantic compromise — most major Nigerian marketplaces
--   (Jiji, Jumia) handle this split similarly.
--
-- WHY SLUG `jewelry-watches` (NOT JUST `jewelry`):
--   Honest representation of the category's scope. A buyer landing on
--   /categories/jewelry-watches sees the URL match the content. Naming
--   the slug `jewelry` would create UX dissonance for watch listings
--   showing up there.
--
-- WHY sort_order = 7:
--   Existing Fashion subs occupy sort_order 1-6 (Men's Clothing,
--   Women's Clothing, Kids' Clothing, Traditional/Ankara, Shoes,
--   Accessories). Appending at 7 has zero conflict, requires no
--   rebalance of existing rows, and reads sensibly — Accessories at 6
--   is the closest semantic neighbor (both are "adornment + small
--   wearable" categories), so Jewelry & Watches landing immediately
--   after produces a natural flow when buyers browse Fashion's sub-grid.
--
-- WHY supports_inventory = true:
--   Jewelry sellers commonly stock multiples of the same item (10
--   identical silver chains, 5 of a particular ring design). Watch
--   resellers may also carry multiples of common models. Inheriting
--   Fashion's parent default (true) is correct. Explicit in the INSERT
--   below for documentation-of-intent — also guards against future
--   schema-default drift.
--
-- WHY NO category_specs OVERRIDE:
--   `getSpecsForCategory(slug, parentSlug)` falls back to the parent's
--   schema when the subcategory has no own entry. Fashion's parent
--   specs (size + color, both optional text) cover both jewelry (ring
--   size 6, chain color "gold") and watches (case size 42mm, color
--   "stainless steel") adequately at v1. A future override (e.g.
--   material, gender, band_type) is a separate scope when real seller
--   demand surfaces — pure data-config change, no migration.
--
-- WHY RICH search_aliases (DEPARTURE FROM EXISTING SUBCATEGORY PATTERN):
--   Existing subcategory rows leave search_aliases at the column
--   default '[]'; aliases today live only on parent rows. But marketplace
--   category-search (Phase D.7.2) routes via JSONB containment against
--   the aliases column on EVERY category row — sub rows participate too
--   if populated. Jewelry & Watches has a distinctive buyer-query
--   vocabulary ("necklace", "wristwatch", "bangle") that should resolve
--   to this category, not the parent. Banking the search-aliases-on-
--   subcategory pattern in D-143 — future subcategory additions
--   (e.g., Sneakers under Shoes) should populate aliases the same way.
--
-- WHY UK/US SPELLING PARITY ("jewellery" alongside "jewelry"):
--   Nigerian market commonly uses the UK spelling. Missing "jewellery"
--   would silently route real buyer queries to no results — a
--   correctness gap, not a polish improvement. Plurals ("jewelries",
--   "jewelleries") cover common typing patterns.
--
-- WHY `smartwatch` IS DELIBERATELY EXCLUDED FROM ALIASES:
--   The existing `smart-wearables` subcategory under Mobile Phones &
--   Tablets is where smartwatches (Apple Watch, Galaxy Watch, etc.)
--   route. Adding "smartwatch" to Jewelry & Watches' aliases would
--   create dual-routing ambiguity — a buyer query for "smartwatch"
--   would match both categories and the search resolution becomes
--   non-deterministic. Keep "smartwatch" routing to smart-wearables;
--   keep "watch"/"watches"/"wristwatch"/"wristwatches" routing here
--   (mechanical/quartz/luxury watches, distinct shopping intent from
--   wearable tech).
--
-- ============================================================
-- EXECUTION (Supabase SQL Editor):
--   `RESET ROLE;` first. Then §0 paste back, §1 BEGIN..COMMIT, §2
--   paste back. No live-fire controls — this is a single data-row
--   insert; the structural + data + sanity checks in §2 cover the
--   verification surface adequately.


-- ============================================================
-- SECTION 0 — PRE-FLIGHT (read-only; run + paste first)
-- ============================================================
-- Expect:
--   fashion_parent_exists                = true
--   fashion_id                           = (some uuid; record for §1 mental check)
--   jewelry_watches_slug_exists          = false
--   sort_order_7_conflict_under_fashion  = false
--   current_fashion_sub_count            = 6  (will be 7 post-§1)
--   total_categories_count               = <baseline; §2 confirms +1>

SELECT
  EXISTS (
    SELECT 1 FROM public.categories
    WHERE slug = 'fashion' AND parent_id IS NULL
  ) AS fashion_parent_exists,
  (
    SELECT id FROM public.categories
    WHERE slug = 'fashion' AND parent_id IS NULL
  ) AS fashion_id,
  EXISTS (
    SELECT 1 FROM public.categories WHERE slug = 'jewelry-watches'
  ) AS jewelry_watches_slug_exists,
  EXISTS (
    SELECT 1 FROM public.categories
    WHERE parent_id = (
      SELECT id FROM public.categories
      WHERE slug = 'fashion' AND parent_id IS NULL
    )
    AND sort_order = 7
  ) AS sort_order_7_conflict_under_fashion,
  (
    SELECT count(*) FROM public.categories
    WHERE parent_id = (
      SELECT id FROM public.categories
      WHERE slug = 'fashion' AND parent_id IS NULL
    )
  ) AS current_fashion_sub_count,
  (SELECT count(*) FROM public.categories) AS total_categories_count;

-- 0b. Show all current Fashion subcategories ordered by sort_order so
--     the operator can confirm the existing list matches the seed
--     snapshot:
--       1: mens-clothing       (Men's Clothing)
--       2: womens-clothing     (Women's Clothing)
--       3: kids-clothing       (Kids' Clothing)
--       4: traditional-ankara  (Traditional / Ankara)
--       5: shoes               (Shoes)
--       6: accessories-fashion (Accessories)
--     If any divergence, STOP and reconcile before §1.
SELECT slug, name, sort_order
FROM public.categories
WHERE parent_id = (
  SELECT id FROM public.categories
  WHERE slug = 'fashion' AND parent_id IS NULL
)
ORDER BY sort_order;


-- ============================================================
-- SECTION 1 — MIGRATION (one transaction)
-- ============================================================
-- Run as `postgres` (RESET ROLE; in the SQL Editor first).
BEGIN;

-- ----- 1. Insert Jewelry & Watches subcategory under Fashion -----
-- INSERT ... SELECT resolves Fashion's id atomically (no separate read +
-- write round-trip). If Fashion's row is somehow absent the INSERT
-- silently inserts zero rows — §2 catches this via "new row exists"
-- and "Fashion sub count now 7" checks.
--
-- Column defaults that we deliberately rely on (not specified):
--   tier                = 3      (subcategory; tier semantically meaningful for parents only)
--   icon_name           = NULL   (vestigial post-D.4.1)
--   category_features   = '{}'   (no runtime UI tunables at this level)
--   created_at          = now()
--   updated_at          = now()
INSERT INTO public.categories (
  name, slug, parent_id, sort_order, search_aliases, supports_inventory
)
SELECT
  'Jewelry & Watches',
  'jewelry-watches',
  c.id,
  7,
  '[
    "jewelry", "jewellery", "jewelries", "jewelleries",
    "watch", "watches", "wristwatch", "wristwatches",
    "necklace", "necklaces", "bracelet", "bracelets",
    "earring", "earrings", "ring", "rings",
    "pendant", "pendants", "chain", "chains",
    "bangle", "bangles", "anklet", "anklets"
  ]'::jsonb,
  true
FROM public.categories c
WHERE c.slug = 'fashion'
  AND c.parent_id IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- SECTION 2 — VERIFICATION (structural + data + sanity)
-- ============================================================

-- ----- Structural -----

-- 2a. New row exists with the expected slug + name.
--     Expect: 1 row.
SELECT slug, name
FROM public.categories
WHERE slug = 'jewelry-watches';

-- 2b. parent_id matches Fashion's id. Re-resolve Fashion via subquery
--     and compare — defends against the row landing under the wrong
--     parent (the §1 SELECT shouldn't produce that outcome, but
--     verifying directly is cheap).
--     Expect: parent_matches_fashion = true.
SELECT
  (SELECT parent_id FROM public.categories WHERE slug = 'jewelry-watches')
  = (SELECT id FROM public.categories WHERE slug = 'fashion' AND parent_id IS NULL)
  AS parent_matches_fashion;

-- 2c. Column shape — sort_order, supports_inventory, tier, category_features.
--     Expect:
--       sort_order=7, supports_inventory=true, tier=3,
--       category_features='{}'::jsonb.
SELECT sort_order, supports_inventory, tier, category_features
FROM public.categories
WHERE slug = 'jewelry-watches';

-- ----- Data -----

-- 2d. search_aliases has exactly 24 elements.
--     Expect: alias_count = 24.
SELECT jsonb_array_length(search_aliases) AS alias_count
FROM public.categories
WHERE slug = 'jewelry-watches';

-- 2e. search_aliases contains each of the 4 spot-checked critical
--     terms. The @> containment operator is the same shape the
--     marketplace search uses, so this verifies the buyer-side query
--     path will resolve too.
--     Expect: all four boolean columns = true.
SELECT
  search_aliases @> '["jewelry"]'::jsonb   AS has_jewelry,
  search_aliases @> '["jewellery"]'::jsonb AS has_jewellery,
  search_aliases @> '["watch"]'::jsonb     AS has_watch,
  search_aliases @> '["bangle"]'::jsonb    AS has_bangle
FROM public.categories
WHERE slug = 'jewelry-watches';

-- 2f. Defensive: confirm `smartwatch` is NOT in the alias set (would
--     create dual-routing ambiguity with smart-wearables under Mobile).
--     Expect: has_smartwatch = false.
SELECT
  search_aliases @> '["smartwatch"]'::jsonb AS has_smartwatch
FROM public.categories
WHERE slug = 'jewelry-watches';

-- 2g. Fashion sub count is now 7 (was 6 pre-§1).
--     Expect: fashion_sub_count_now = 7.
SELECT count(*) AS fashion_sub_count_now
FROM public.categories
WHERE parent_id = (
  SELECT id FROM public.categories
  WHERE slug = 'fashion' AND parent_id IS NULL
);

-- 2h. Total category row count = pre-migration count + 1. Operator
--     compares against §0's total_categories_count.
SELECT count(*) AS total_categories_count_now
FROM public.categories;

-- ----- Sanity -----

-- 2i. Slug uniqueness preserved — zero duplicates platform-wide.
--     Expect: zero rows.
SELECT slug, count(*) AS dup_count
FROM public.categories
GROUP BY slug
HAVING count(*) > 1;

-- 2j. Fashion children's sort_orders are exactly 1..7 (no gaps, no
--     duplicates). Aggregating to an array and comparing against the
--     expected sequence catches the case where the §1 INSERT somehow
--     produced a duplicate at sort_order 7 (which would be valid at
--     the DB layer since sort_order has no UNIQUE, but would surface
--     as nondeterministic display order in the UI).
--     Expect: sort_orders_match = true.
SELECT
  array_agg(sort_order ORDER BY sort_order)
    = ARRAY[1, 2, 3, 4, 5, 6, 7]
  AS sort_orders_match
FROM public.categories
WHERE parent_id = (
  SELECT id FROM public.categories
  WHERE slug = 'fashion' AND parent_id IS NULL
);

-- 2k. Show the full updated Fashion sub list with sort_orders and
--     the new row's alias_count — operator's final visual confirm.
--     Expect: 7 rows, last one is jewelry-watches at sort_order 7
--     with alias_count = 24.
SELECT
  slug,
  name,
  sort_order,
  jsonb_array_length(search_aliases) AS alias_count,
  supports_inventory
FROM public.categories
WHERE parent_id = (
  SELECT id FROM public.categories
  WHERE slug = 'fashion' AND parent_id IS NULL
)
ORDER BY sort_order;

-- ============================================================
-- END OF E.2.19.0
-- ============================================================
