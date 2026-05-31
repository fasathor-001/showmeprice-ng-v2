-- ============================================================
-- E.2.21.0-reveal-seller-contact-rpc.sql
-- Feature N (slice 1 of 3) — atomic reveal RPC for the buyer-facing
-- WhatsApp reveal flow. SECURITY DEFINER + GUC bypass to decrement
-- profiles.signup_free_reveals_remaining (freeze-protected by
-- E.2.14.0). Per-seller dedup. Position 1 / messaging primary —
-- this RPC ONLY exposes a VERIFIED seller WhatsApp number.
--
-- PRECEDENT — E.2.16.0 admin_change_user_phone (~line 94+):
--   SECURITY DEFINER + SET search_path = public + REVOKE EXECUTE FROM
--   PUBLIC + targeted GRANT + transaction-local GUC bypass for the
--   freeze trigger + atomic write inside the same transaction.
-- Same shape used here, with FOR UPDATE row lock added to defeat
-- double-click double-spend on the buyer's free-reveal counter.
--
-- VALIDATED 2026-05-31 — function body dry-ran GREEN against live data
-- inside a rolled-back transaction. All six cases passed:
--   (e) self_reveal      → status=self_reveal, whatsapp=NULL
--   (d) unverified_wa    → status=seller_whatsapp_not_available, whatsapp=NULL
--   (a) revealed         → counter decremented by 1, dedup row inserted
--   (b) already_revealed → counter unchanged, no new row, whatsapp returned
--   (c) no_reveals_remaining → whatsapp=NULL (no leak on exhausted branch)
--   (f) listing_unavailable  → FK violation EXCEPTION rolled the decrement back
--
-- RETURN SHAPE (single row):
--   status                  text   -- one of:
--                                  --   'revealed'                      (success, whatsapp returned, decremented)
--                                  --   'already_revealed'              (success, whatsapp returned, NO decrement)
--                                  --   'no_reveals_remaining'          (exhausted, NO whatsapp)
--                                  --   'self_reveal'                   (buyer is the seller, NO whatsapp)
--                                  --   'seller_unavailable'            (no business / unverified / disabled, NO whatsapp)
--                                  --   'seller_whatsapp_not_available' (no verified WA on the business, NO whatsapp)
--                                  --   'listing_unavailable'           (listing FK violation on insert; decrement rolled back)
--   whatsapp                text   -- NULL unless status in ('revealed','already_revealed')
--   free_reveals_remaining  integer
--
-- RLS: this function bypasses RLS via SECURITY DEFINER. contact_reveals
-- RLS verified clean in the pre-build audit; buyer_insert WITH CHECK
-- is loose on seller_id/listing_id integrity but moot here because the
-- RPC is the sole write path and enforces those itself.
--
-- ATOMICITY: single transaction. FOR UPDATE on profiles row serializes
-- concurrent reveal attempts by the same buyer. If the listing_id FK
-- violation fires on INSERT, the wrapping BEGIN/EXCEPTION block rolls
-- the decrement back to pre-call state (PL/pgSQL savepoint semantics)
-- and reverts the LOCAL GUC alongside it — no half-state where the
-- buyer paid a credit but no reveal landed.
--
-- TO APPLY: run as `postgres` (RESET ROLE; in the SQL Editor first).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.reveal_seller_contact(
  p_buyer_id   uuid,
  p_seller_id  uuid,
  p_listing_id uuid
) RETURNS TABLE (
  status                 text,
  whatsapp               text,
  free_reveals_remaining integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller_whatsapp           text;
  v_seller_whatsapp_verified  timestamptz;
  v_business_verified         public.verification_status;
  v_business_disabled         boolean;
  v_remaining                 integer;
  v_dedup_exists              boolean;
BEGIN
  -- 1. GUARD: self-reveal.
  IF p_buyer_id = p_seller_id THEN
    RETURN QUERY SELECT 'self_reveal'::text, NULL::text, NULL::integer;
    RETURN;
  END IF;

  -- 2 + 3 + 4. RESOLVE the seller's business and capture verification /
  -- disabled / whatsapp state in one read. businesses.owner_id is UNIQUE
  -- (one business per profile), so this returns at most one row.
  SELECT b.verification_status,
         b.is_disabled,
         b.seller_whatsapp,
         b.seller_whatsapp_verified_at
    INTO v_business_verified,
         v_business_disabled,
         v_seller_whatsapp,
         v_seller_whatsapp_verified
  FROM public.businesses b
  WHERE b.owner_id = p_seller_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'seller_unavailable'::text, NULL::text, NULL::integer;
    RETURN;
  END IF;

  IF v_business_verified <> 'verified' OR v_business_disabled = true THEN
    RETURN QUERY SELECT 'seller_unavailable'::text, NULL::text, NULL::integer;
    RETURN;
  END IF;

  -- 4. Verified-whatsapp gate. The E.2.11.0 invariant guarantees
  -- seller_whatsapp_verified_at is non-null IFF the current
  -- seller_whatsapp value was OTP-proven. Checking both is belt-and-
  -- braces against any future drift; an unverified or absent number
  -- can never escape this branch.
  IF v_seller_whatsapp IS NULL OR v_seller_whatsapp_verified IS NULL THEN
    RETURN QUERY SELECT 'seller_whatsapp_not_available'::text, NULL::text, NULL::integer;
    RETURN;
  END IF;

  -- 5. LOCK the buyer row. FOR UPDATE serializes concurrent reveal taps
  -- by this buyer; a second tx blocks here until the first commits,
  -- then sees the post-decrement count + the just-inserted dedup row
  -- (so the second tx will short-circuit on dedup or no_reveals).
  SELECT signup_free_reveals_remaining
    INTO v_remaining
  FROM public.profiles
  WHERE id = p_buyer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Buyer profile missing is an upstream invariant violation. Treat
    -- as seller_unavailable rather than leak an auth-shape sentinel
    -- via this user-callable RPC.
    RETURN QUERY SELECT 'seller_unavailable'::text, NULL::text, NULL::integer;
    RETURN;
  END IF;

  -- 6. DEDUP (per-seller). One reveal of a given seller costs at most
  -- one credit, regardless of how many of that seller's listings the
  -- buyer reveals from. Matches D-113's payment-details prerequisite
  -- (per-seller match, not per-listing).
  SELECT EXISTS (
    SELECT 1
      FROM public.contact_reveals
     WHERE buyer_id  = p_buyer_id
       AND seller_id = p_seller_id
  ) INTO v_dedup_exists;

  IF v_dedup_exists THEN
    -- Re-reveal: return the verified whatsapp again. NO decrement, NO
    -- new insert. v_remaining is the current count (unchanged).
    RETURN QUERY SELECT 'already_revealed'::text, v_seller_whatsapp, v_remaining;
    RETURN;
  END IF;

  -- 7. EXHAUSTED — first attempt at this seller but no free reveals
  -- left. NO whatsapp returned.
  IF v_remaining <= 0 THEN
    RETURN QUERY SELECT 'no_reveals_remaining'::text, NULL::text, v_remaining;
    RETURN;
  END IF;

  -- 8. FIRST REVEAL of this seller, remaining > 0 → decrement + record.
  -- Wrap the UPDATE + INSERT in one BEGIN/EXCEPTION so a FK violation
  -- on the INSERT (listing deleted concurrently) rolls the UPDATE back
  -- via savepoint semantics. The LOCAL GUC is reverted alongside.
  BEGIN
    -- LOCAL GUC bypass — opens the E.2.14.0 freeze trigger window for
    -- the UPDATE below. signup_free_reveals_remaining is in the
    -- protected set; without this, the UPDATE would raise 42501.
    PERFORM set_config('app.profile_system_write_authorized', 'true', true);

    UPDATE public.profiles
       SET signup_free_reveals_remaining = signup_free_reveals_remaining - 1,
           updated_at = now()
     WHERE id = p_buyer_id;

    INSERT INTO public.contact_reveals (buyer_id, seller_id, listing_id)
    VALUES (p_buyer_id, p_seller_id, p_listing_id);

    v_remaining := v_remaining - 1;
  EXCEPTION
    WHEN foreign_key_violation THEN
      -- listing_id no longer points at a valid products row (deleted
      -- between page load and reveal tap). The savepoint rollback
      -- undoes both the UPDATE and the LOCAL GUC; the buyer's count
      -- is preserved at its pre-call value.
      RETURN QUERY SELECT 'listing_unavailable'::text, NULL::text, v_remaining;
      RETURN;
  END;

  RETURN QUERY SELECT 'revealed'::text, v_seller_whatsapp, v_remaining;
END;
$$;

COMMENT ON FUNCTION public.reveal_seller_contact(uuid, uuid, uuid) IS
  'Feature N slice 1. Buyer-facing reveal RPC. Atomically: guards self-reveal, resolves the seller business via owner_id, gates on verification_status=verified + is_disabled=false + verified seller_whatsapp (E.2.11.0 invariant), locks the buyer profile row FOR UPDATE, per-seller dedups against contact_reveals, otherwise sets app.profile_system_write_authorized LOCAL, decrements signup_free_reveals_remaining (E.2.14.0 freeze-protected), and INSERTs a contact_reveals row. Returns (status, whatsapp, free_reveals_remaining). Status values: revealed | already_revealed | no_reveals_remaining | self_reveal | seller_unavailable | seller_whatsapp_not_available | listing_unavailable. SECURITY DEFINER, search_path=public. EXECUTE locked down: REVOKE FROM PUBLIC + anon + service_role, GRANT to authenticated only — the function does NOT verify p_buyer_id against auth.uid(); that bind is the server-action wrappers job (slice 2 / requireActiveUser).';

-- ACL lockdown. Supabase auto-grants EXECUTE to anon/authenticated/
-- service_role on public functions; REVOKE FROM PUBLIC alone does NOT
-- remove the role-specific grants. Explicit triple-REVOKE matches the
-- E.2.16.0 / E.2.1.1 precedent.
REVOKE EXECUTE ON FUNCTION public.reveal_seller_contact(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reveal_seller_contact(uuid, uuid, uuid) FROM anon, service_role;
GRANT  EXECUTE ON FUNCTION public.reveal_seller_contact(uuid, uuid, uuid) TO   authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
