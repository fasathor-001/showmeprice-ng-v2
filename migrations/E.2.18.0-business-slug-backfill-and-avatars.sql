-- ============================================================
-- E.2.18.0-business-slug-backfill-and-avatars.sql
-- Seller shop pages — Step 1 of 2 — DB foundation.
-- ============================================================
--
-- Backfills the existing `businesses.slug` column for any rows with
-- NULL slug, flips it to NOT NULL post-backfill, and creates the
-- `business-avatars` public-read storage bucket with 3 RLS policies
-- mirroring the existing `product-images` precedent.
--
-- Step 2 (separate commit) ships the app code: /sellers/[slug] page,
-- avatar upload UI on the dashboard, link integration from the listing
-- detail page seller card to the new shop page. This migration provides
-- the schema + storage foundation only.
--
-- ============================================================
-- DESIGN CHOICES
-- ============================================================
--
-- WHY BACKFILL + NOT-NULL FLIP IN THE SAME TRANSACTION:
--   Atomicity. The window between "some rows still null" and "constraint
--   enforced" must not be observable to concurrent writers. Doing both
--   in one BEGIN..COMMIT means either both land or neither does — no
--   intermediate state where the app starts assuming slug is non-null
--   but a row still has slug=NULL. At apply time the backfill ran over
--   4 rows (after the operator's pre-migration test-data cleanup);
--   whole transaction was well under a second.
--
-- WHY NO RANDOM SUFFIX ON THE SLUG (UNLIKE listing slugs):
--   Listing slugs are titles ("iPhone 15 Pro Max") that collide
--   constantly across thousands of listings, so generateListingSlug
--   appends a 4-char random suffix for uniqueness. Business slugs are
--   brand identifiers that should be STABLE + HUMAN-READABLE +
--   BRANDABLE — Jiji's "/dealer/abc-motors", not
--   "/dealer/abc-motors-xy7z". Collision is rare (the 4 current
--   business_names produced 4 distinct slugs cleanly); app-layer
--   uniqueness check + numeric suffix (-2, -3) handles future
--   collisions without polluting normal cases with random gibberish.
--
-- WHY PUBLIC-READ ON THE AVATAR BUCKET:
--   Avatars are public branding — same trust model as product-images
--   (anyone can view, only owner can write). Opposite of
--   verification-id-documents / verification-selfies which are
--   strict-private PII. A buyer browsing the marketplace must be able
--   to see seller avatars without authentication; making the bucket
--   private would require signed URLs on every render of every shop
--   card / every listing detail page seller block — wasteful and
--   complicates server-side rendering. Public bucket + owner-write
--   policy is the right trust shape.
--
-- WHY MIRROR product-images RLS SHAPE EXACTLY:
--   3 policies: owner_insert (folder match on first path segment),
--   owner_delete (same check on DELETE), public_select (anyone reads).
--   product-images is the existing, deployed, audit-reviewed precedent
--   for "owner-writable / public-readable" buckets on this codebase.
--   Inventing a new pattern (e.g. adding an UPDATE policy for upsert
--   semantics) creates a second mental model future maintainers must
--   reconcile. The replace-avatar flow uses timestamped filenames +
--   new INSERT + best-effort old-file DELETE, sidestepping any
--   UPDATE-policy need entirely. Same shape as how product-images
--   handles photo replacement.
--
-- WHY 2 MB FILE SIZE LIMIT:
--   Avatars display at 80px max (shop-page header) and 32–48px in
--   listing cards. A 1080×1080 PNG with reasonable compression weighs
--   under 1 MB; even a high-quality square JPG well under 2 MB. The
--   existing product-images bucket caps at 5 MB because product photos
--   are display-large (up to 800px wide in detail galleries). Avatars
--   don't need that headroom. Smaller cap = less Storage waste from
--   accidental "I uploaded a 4K screenshot as my logo" mistakes.
--
-- ABOUT `businesses.logo_path`:
--   The `logo_path` column was added at Phase E.1.0 anticipating exactly
--   this build (ACTUAL_SCHEMA line 170: "Badge renders on the not-yet-
--   built public storefront"). Already nullable, already type text,
--   already in the Drizzle mirror. This migration does NOT add the
--   column — it just enables the storage layer that will populate it.
--   Step 2's app code writes paths into `logo_path`; this migration
--   makes that path resolvable.
--
-- ============================================================
-- EXECUTION (Supabase SQL Editor):
--   `RESET ROLE;` first (ALTER TABLE + storage.bucket INSERT +
--   CREATE POLICY all need postgres). Then §0 paste back, §1
--   BEGIN..COMMIT, §2 paste back. §2 controls are ROLLBACK-wrapped
--   so verification leaves no residue.


-- ============================================================
-- SECTION 0 — PRE-FLIGHT (read-only; run + paste first)
-- ============================================================
-- Expect:
--   slug_column_exists                 = true   (column from Phase E.1.0)
--   slug_currently_nullable            = true   (this migration flips it)
--   logo_path_column_exists            = true   (column from Phase E.1.0)
--   business_avatars_bucket_exists     = false  (this migration creates it)
--   product_images_bucket_exists       = true   (we mirror its shape)
--   new_policies_already_present_count = 0      (this migration creates 3)

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='businesses'
      AND column_name='slug'
  ) AS slug_column_exists,
  (
    SELECT is_nullable = 'YES' FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='businesses'
      AND column_name='slug'
  ) AS slug_currently_nullable,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='businesses'
      AND column_name='logo_path'
  ) AS logo_path_column_exists,
  EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'business-avatars'
  ) AS business_avatars_bucket_exists,
  EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'product-images'
  ) AS product_images_bucket_exists,
  (
    SELECT count(*) FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname IN (
        'business_avatars_owner_insert',
        'business_avatars_owner_delete',
        'business_avatars_public_select'
      )
  ) AS new_policies_already_present_count;

-- 0b. Show the existing businesses with their current slug state and
--     the slug we'd compute. If any rows already have a slug, the
--     backfill UPDATE skips them (idempotent via WHERE slug IS NULL).
SELECT
  business_name,
  slug AS current_slug,
  regexp_replace(
    lower(regexp_replace(business_name, '[^a-zA-Z0-9]+', '-', 'g')),
    '(^-+|-+$)', '', 'g'
  ) AS computed_slug
FROM public.businesses
ORDER BY business_name;

-- 0c. Show the existing product-images bucket RLS policies on
--     storage.objects, for reference. Expect 3 rows:
--       product_images_owner_insert
--       product_images_owner_delete
--       product_images_public_select
--     (Or with different but equivalent names — the new policies follow
--     this naming convention exactly.)
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
  AND policyname ILIKE 'product_images%'
ORDER BY policyname;

-- 0d. Existing business row count + total profiles count. Need at least
--     one profile without a business for the §2 control INSERTs to find
--     an unused owner_id (businesses.owner_id is UNIQUE).
SELECT
  (SELECT count(*) FROM public.businesses) AS business_count,
  (SELECT count(*) FROM public.profiles)  AS profile_count,
  (
    SELECT count(*) FROM public.profiles p
    LEFT JOIN public.businesses b ON b.owner_id = p.id
    WHERE b.id IS NULL
  ) AS profiles_without_business_count;


-- ============================================================
-- SECTION 1 — MIGRATION (one transaction)
-- ============================================================
-- Run as `postgres` (RESET ROLE; in the SQL Editor first).
BEGIN;

-- ----- 1. Backfill slug for existing rows (idempotent via WHERE slug IS NULL) -----
-- Deterministic SQL matching the JavaScript helper (generateBusinessSlug,
-- shipped in Step 2). Produces identical output so app-time inserts
-- generate slugs identical in shape to this backfill.
--   Inner regexp_replace: convert any run of non-alphanumeric to a dash.
--   Outer regexp_replace: strip leading/trailing dashes.
--   lower(): URL-safe casing.
-- The 4 business_names at apply time produced 4 distinct slugs with no
-- collisions (verified via §0b output above before running):
--   Darace Gadgets        → darace-gadgets
--   Jervis_luxebrand      → jervis-luxebrand
--   Reseller By OJemba    → reseller-by-ojemba
--   ShowMePrice-NG        → showmeprice-ng
UPDATE public.businesses
SET slug = regexp_replace(
  lower(regexp_replace(business_name, '[^a-zA-Z0-9]+', '-', 'g')),
  '(^-+|-+$)', '', 'g'
)
WHERE slug IS NULL;

-- ----- 2. Flip slug to NOT NULL -----
-- Must come AFTER the backfill in the same transaction so there's never
-- an observable state with the constraint enforced but rows still NULL.
ALTER TABLE public.businesses
  ALTER COLUMN slug SET NOT NULL;

-- ----- 3. Create the business-avatars storage bucket -----
-- public = true so anyone can render avatar URLs without authentication.
-- 2097152 bytes = 2 MiB cap. MIME allowlist excludes GIF (static branding
-- only) and PDF (irrelevant for images).
INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
VALUES (
  'business-avatars',
  'business-avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);

-- ----- 4. RLS policies on storage.objects (3 — mirror product-images shape) -----
-- Folder convention: {business_id}/<filename>. storage.foldername()
-- parses the path; index [1] is the first folder. We match it against
-- the business_id (cast to text) for businesses owned by auth.uid().

CREATE POLICY "business_avatars_owner_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-avatars'
  AND EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id::text = (storage.foldername(name))[1]
      AND owner_id = auth.uid()
  )
);

CREATE POLICY "business_avatars_owner_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'business-avatars'
  AND EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id::text = (storage.foldername(name))[1]
      AND owner_id = auth.uid()
  )
);

CREATE POLICY "business_avatars_public_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'business-avatars');

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- SECTION 2 — VERIFICATION (structural + data + controls + sanity)
-- ============================================================

-- 2a. businesses.slug is now NOT NULL.
--     Expect: is_nullable='NO'.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='businesses'
  AND column_name='slug';

-- 2b. business-avatars bucket exists with correct config.
--     Expect: 1 row — public=true, file_size_limit=2097152,
--     allowed_mime_types contains the 3 expected MIME types.
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'business-avatars';

-- 2c. The 3 new RLS policies present on storage.objects for the bucket.
--     Expect: 3 rows in alphabetical order:
--       business_avatars_owner_delete
--       business_avatars_owner_insert
--       business_avatars_public_select
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
  AND policyname ILIKE 'business_avatars%'
ORDER BY policyname;

-- 2d. All existing businesses have a non-null slug.
--     Expect: null_count = 0, total_count = live business count.
SELECT
  (SELECT count(*) FROM public.businesses WHERE slug IS NULL) AS null_count,
  (SELECT count(*) FROM public.businesses) AS total_count;

-- 2e. No slug collisions across existing businesses.
--     Expect: zero rows returned.
SELECT slug, count(*) AS dup_count
FROM public.businesses
GROUP BY slug
HAVING count(*) > 1;

-- 2f. Verify each row's slug is non-null and follows the deterministic
--     shape produced by the regex above. At apply time (post-cleanup)
--     the 4 rows produced:
--       darace-gadgets        (Darace Gadgets, unsubmitted)
--       jervis-luxebrand      (Jervis_luxebrand, verified)
--       reseller-by-ojemba    (Reseller By OJemba, verified)
--       showmeprice-ng        (ShowMePrice-NG, unsubmitted)
--     A future replay against a different row set would produce
--     different slugs by the same rule.
SELECT slug, business_name
FROM public.businesses
ORDER BY slug;

-- ----- Live-fire controls (ROLLBACK-wrapped — no residue) -----
-- Each control finds an existing profile that doesn't yet own a business
-- (LEFT JOIN ... WHERE b.id IS NULL) and uses that profile's id as the
-- owner_id. businesses.owner_id is UNIQUE so we can't reuse a seller's
-- profile; this picks one of the platform's buyer-only profiles. §0d
-- confirms the count is > 0 before running these.

-- 2g. POSITIVE — INSERT with a non-null, unique slug succeeds.
--     Expect: 1 row returned with slug='test-slug-control'.
BEGIN;
  INSERT INTO public.businesses (owner_id, business_name, slug)
  SELECT p.id, 'qa control biz', 'test-slug-control'
  FROM public.profiles p
  LEFT JOIN public.businesses b ON b.owner_id = p.id
  WHERE b.id IS NULL
  LIMIT 1
  RETURNING id, slug, business_name;
ROLLBACK;

-- 2h. NEGATIVE — INSERT with slug=NULL fails with not_null_violation.
--     Expect: ERROR 23502 against businesses_slug column.
BEGIN;
  INSERT INTO public.businesses (owner_id, business_name, slug)
  SELECT p.id, 'qa control biz null slug', NULL
  FROM public.profiles p
  LEFT JOIN public.businesses b ON b.owner_id = p.id
  WHERE b.id IS NULL
  LIMIT 1;
ROLLBACK;

-- 2i. NEGATIVE — INSERT with slug matching an existing row fails with
--     unique_violation against businesses_slug_unique.
--     Expect: ERROR 23505.
BEGIN;
  INSERT INTO public.businesses (owner_id, business_name, slug)
  SELECT p.id, 'qa control biz dup slug', 'jervis-luxebrand'
  FROM public.profiles p
  LEFT JOIN public.businesses b ON b.owner_id = p.id
  WHERE b.id IS NULL
  LIMIT 1;
ROLLBACK;

-- ----- Sanity -----

-- 2j. RLS policies on the businesses TABLE unchanged. The new policies
--     above are on storage.objects, not on businesses. This query
--     confirms no businesses-table policy was accidentally created or
--     dropped.
--     Expect: same policy list as pre-migration (whatever count it was;
--     this migration adds zero, removes zero on this table).
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname='public' AND tablename='businesses'
ORDER BY policyname;

-- 2k. Existing storage buckets unchanged in config.
--     Expect: 3 rows (product-images, verification-id-documents,
--     verification-selfies) with their original public, size,
--     allowed_mime_types — none touched by this migration.
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('product-images', 'verification-id-documents', 'verification-selfies')
ORDER BY id;

-- 2l. Existing business row count unchanged.
--     Expect: same count as §0d's business_count (no accidental DELETEs).
SELECT count(*) AS business_count_post_migration
FROM public.businesses;

-- ============================================================
-- END OF E.2.18.0
-- ============================================================
