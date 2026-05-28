-- ============================================================
-- E.2.13.0-listing-moderation.sql
-- Stage 2 — admin per-listing moderation (hide / un-hide)
-- ============================================================
--
-- Three additive changes, one transaction:
--   1. ADD products.hidden_at (timestamptz, nullable). Non-null = the
--      listing has been hidden by an admin at that timestamp. NULL = the
--      listing is in its normal lifecycle state (status drives visibility).
--      Timestamp-as-flag-and-audit pattern, matching seller_whatsapp_verified_at.
--   2. UPDATE the public-read RLS policies on `products` and `product_images`
--      to additionally require `hidden_at IS NULL`. Existing visible listings
--      (hidden_at NULL by default) are unaffected; setting hidden_at to a
--      timestamp immediately removes the listing AND its images from public
--      reads.
--   3. CREATE TRIGGER freeze_product_hidden_at — BEFORE UPDATE on products,
--      raises if a non-admin attempts to change hidden_at. Mirrors the
--      freeze_business_verification pattern (D-017): RLS can't reference
--      OLD, so column-level freezes live in triggers. Without this guard,
--      products_seller_update (which permits sellers to UPDATE their own
--      rows) would let a hidden seller un-hide themselves.
--
-- Why not add 'hidden' to product_status enum:
--   Moderation is orthogonal to the seller's lifecycle status (per Stage 2
--   directive). A listing can be active + admin-hidden, or sold + not-hidden,
--   etc. Two axes, two fields.
--
-- Why ALTER POLICY rather than DROP+CREATE:
--   ALTER POLICY ... USING (...) atomically updates the predicate. DROP+CREATE
--   would leave a brief no-policy window inside the transaction (technically
--   safe under BEGIN..COMMIT but the ALTER form is cleaner).
--
-- Why no admin_action_log write here:
--   admin_action_log.admin_id FKs to the separated `admins` table (Phase E §14
--   future-state, D-081 deferred). No existing admin action in the codebase
--   writes to admin_action_log; introducing audit JUST for listing moderation
--   creates uneven coverage. Consistent audit-write coverage is a separate
--   focused commit (flagged follow-up). The hidden_at timestamp is partial
--   audit (we know WHEN it was hidden + only admin RLS could have written it).
--
-- Application code (Stage 2 server actions + UI) lands AFTER §2 verification
-- is green, per DB-first / code-second.
--
-- EXECUTION: run §0 (paste), then §1 as one BEGIN..COMMIT submission (no
-- text selected), then §2 (paste).

-- ============================================================
-- SECTION 0 — PRE-FLIGHT (read-only; run + paste first)
-- ============================================================
-- Expect:
--   products_exists                 = true
--   hidden_at_col_exists            = false
--   products_public_policy_exists   = true
--   images_public_policy_exists     = true
--   admin_all_policy_exists         = true   (sanity — admin RLS we'll rely on)
--   trigger_exists                  = false
--   trigger_fn_exists               = false
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='products') AS products_exists,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='products'
            AND column_name='hidden_at')                          AS hidden_at_col_exists,
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname='public' AND tablename='products'
            AND policyname='products_public_read_active')         AS products_public_policy_exists,
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname='public' AND tablename='product_images'
            AND policyname='product_images_public_read')          AS images_public_policy_exists,
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname='public' AND tablename='products'
            AND policyname='products_admin_all')                  AS admin_all_policy_exists,
  EXISTS (SELECT 1 FROM pg_trigger
          WHERE tgname='products_freeze_hidden_at'
            AND tgrelid='public.products'::regclass)              AS trigger_exists,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='freeze_product_hidden_at') AS trigger_fn_exists;


-- ============================================================
-- SECTION 1 — MIGRATION (one transaction)
-- ============================================================
BEGIN;

-- ----- 1. Add the moderation timestamp column -----
ALTER TABLE public.products
  ADD COLUMN hidden_at timestamptz;

COMMENT ON COLUMN public.products.hidden_at IS
  'Non-null = listing hidden by admin at this timestamp. NULL = not admin-hidden. Written only by admin (enforced by products_freeze_hidden_at trigger).';

-- ----- 2. Update public-read RLS to gate on hidden_at -----
ALTER POLICY "products_public_read_active" ON public.products
  USING (status = 'active' AND hidden_at IS NULL);

ALTER POLICY "product_images_public_read" ON public.product_images
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE id = product_images.product_id
        AND status = 'active'
        AND hidden_at IS NULL
    )
  );

-- ----- 3. Column-level freeze on hidden_at (admin-only writes) -----
-- RLS can't enforce column-level write rules (WITH CHECK has no access to
-- OLD), so this trigger enforces it. Mirrors freeze_business_verification's
-- shape (D-017). is_admin(auth.uid()) consults profiles.role + is_disabled
-- via the SECURITY DEFINER function defined in 0001_rls_policies.sql.
CREATE OR REPLACE FUNCTION public.freeze_product_hidden_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Only act when hidden_at is actually changing.
  IF OLD.hidden_at IS DISTINCT FROM NEW.hidden_at THEN
    IF NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only admins can change products.hidden_at'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.freeze_product_hidden_at() FROM PUBLIC;

CREATE TRIGGER products_freeze_hidden_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_product_hidden_at();

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- SECTION 2 — VERIFICATION (read-only; run + paste after migrating)
-- ============================================================

-- 2a. hidden_at column present, nullable, no default.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='products'
  AND column_name='hidden_at';

-- 2b. products_public_read_active policy now references hidden_at.
SELECT policyname, qual
FROM pg_policies
WHERE schemaname='public' AND tablename='products'
  AND policyname='products_public_read_active';

-- 2c. product_images_public_read policy now references hidden_at via the
--     subquery on products.
SELECT policyname, qual
FROM pg_policies
WHERE schemaname='public' AND tablename='product_images'
  AND policyname='product_images_public_read';

-- 2d. Trigger function present + SECURITY DEFINER + search_path pinned.
SELECT
  p.proname,
  p.prosecdef AS security_definer,    -- expect true
  p.proconfig AS config                 -- expect {search_path=public}
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='freeze_product_hidden_at';

-- 2e. Trigger attached to products.
SELECT tgname, tgenabled, tgtype
FROM pg_trigger
WHERE tgname='products_freeze_hidden_at'
  AND tgrelid='public.products'::regclass;

-- 2f. Sanity: no existing rows were affected. (All hidden_at should be NULL.)
SELECT count(*) AS total_products,
       count(*) FILTER (WHERE hidden_at IS NOT NULL) AS hidden_count
FROM public.products;

-- ============================================================
-- END OF E.2.13.0
-- ============================================================
