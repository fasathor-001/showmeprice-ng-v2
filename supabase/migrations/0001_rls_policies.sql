-- ============================================
-- Enable RLS on every public-schema table
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE nigerian_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_reveals ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Helper: is_admin(user_id)
-- ============================================
CREATE OR REPLACE FUNCTION public.is_admin(check_user_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = check_user_id AND role = 'admin' AND is_disabled = false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- profiles policies
-- ============================================

-- Anyone (authenticated or not) can read non-disabled profiles.
CREATE POLICY "profiles_public_read"
  ON profiles FOR SELECT
  USING (is_disabled = false);

-- Users can update their own row. Column-level freeze on `role` is enforced
-- by the freeze_profile_role() trigger (D-017), not by RLS — WITH CHECK
-- can't reference OLD.
CREATE POLICY "profiles_self_update"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can update anyone (for disabling / role changes).
CREATE POLICY "profiles_admin_update"
  ON profiles FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- Inserts are handled by the on_auth_user_created trigger only.
-- No direct INSERT policy: trigger runs as SECURITY DEFINER and bypasses RLS.

-- ============================================
-- businesses policies
-- ============================================

CREATE POLICY "businesses_public_read"
  ON businesses FOR SELECT
  USING (is_disabled = false);

CREATE POLICY "businesses_owner_insert"
  ON businesses FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Owners can update their own row. Column-level freeze on `verification_status`
-- is enforced by the freeze_business_verification() trigger (D-017).
CREATE POLICY "businesses_owner_update"
  ON businesses FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "businesses_admin_update"
  ON businesses FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- ============================================
-- nigerian_states & categories: public read, admin write
-- ============================================

CREATE POLICY "nigerian_states_public_read" ON nigerian_states FOR SELECT USING (true);
CREATE POLICY "nigerian_states_admin_write" ON nigerian_states FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "categories_public_read" ON categories FOR SELECT USING (true);
CREATE POLICY "categories_admin_write" ON categories FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================
-- products policies
-- ============================================

CREATE POLICY "products_public_read_active"
  ON products FOR SELECT
  USING (status = 'active');

CREATE POLICY "products_seller_read_own"
  ON products FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY "products_seller_insert"
  ON products FOR INSERT
  WITH CHECK (
    auth.uid() = seller_id
    AND EXISTS (
      SELECT 1 FROM businesses
      WHERE id = products.business_id AND owner_id = auth.uid()
    )
  );

CREATE POLICY "products_seller_update"
  ON products FOR UPDATE
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "products_seller_delete"
  ON products FOR DELETE
  USING (auth.uid() = seller_id);

CREATE POLICY "products_admin_all"
  ON products FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================
-- product_images policies
-- ============================================

CREATE POLICY "product_images_public_read"
  ON product_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE id = product_images.product_id AND status = 'active'
    )
  );

CREATE POLICY "product_images_seller_read"
  ON product_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE id = product_images.product_id AND seller_id = auth.uid()
    )
  );

CREATE POLICY "product_images_seller_write"
  ON product_images FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE id = product_images.product_id AND seller_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM products
      WHERE id = product_images.product_id AND seller_id = auth.uid()
    )
  );

CREATE POLICY "product_images_admin_all"
  ON product_images FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================
-- subscriptions policies
-- ============================================

CREATE POLICY "subscriptions_self_read"
  ON subscriptions FOR SELECT
  USING (auth.uid() = profile_id);

-- Inserts/updates by service role (Paystack webhook) only — no client-side
-- INSERT/UPDATE policy means RLS denies all writes outside service role.

CREATE POLICY "subscriptions_admin_read"
  ON subscriptions FOR SELECT
  USING (public.is_admin(auth.uid()));

-- ============================================
-- contact_reveals policies
-- ============================================

CREATE POLICY "contact_reveals_buyer_read"
  ON contact_reveals FOR SELECT
  USING (auth.uid() = buyer_id);

CREATE POLICY "contact_reveals_seller_read"
  ON contact_reveals FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY "contact_reveals_buyer_insert"
  ON contact_reveals FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "contact_reveals_admin_read"
  ON contact_reveals FOR SELECT
  USING (public.is_admin(auth.uid()));

-- ============================================
-- seller_verifications policies
-- ============================================

CREATE POLICY "seller_verifications_self_read"
  ON seller_verifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM businesses
      WHERE id = seller_verifications.business_id AND owner_id = auth.uid()
    )
  );

CREATE POLICY "seller_verifications_self_insert"
  ON seller_verifications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM businesses
      WHERE id = seller_verifications.business_id AND owner_id = auth.uid()
    )
  );

CREATE POLICY "seller_verifications_admin_all"
  ON seller_verifications FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================
-- escrow_orders policies
-- ============================================

CREATE POLICY "escrow_orders_party_read"
  ON escrow_orders FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

CREATE POLICY "escrow_orders_buyer_insert"
  ON escrow_orders FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

-- Updates handled via Server Actions / service role only.

CREATE POLICY "escrow_orders_admin_all"
  ON escrow_orders FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================
-- admin_audit_log — admin-only read; inserts via service role only
-- ============================================

CREATE POLICY "admin_audit_log_admin_read"
  ON admin_audit_log FOR SELECT
  USING (public.is_admin(auth.uid()));
