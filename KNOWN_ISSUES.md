# KNOWN_ISSUES.md

Tracked issues. Severity: critical, high, medium, low.

When fixing, move from `## Open` to `## Resolved` with commit hash and date.

## Open

### K-001 — admin role visible to all readers (low)

**Symptom:** `profiles_public_read` exposes the `role` column. Anyone reading any profile can see who's an admin.

**Severity:** low. `role` is `null` or `'admin'` — no secret value. The platform-wide admin list being technically discoverable is similar to public moderator lists on most platforms.

**Fix (when prioritized):** Replace `profiles_public_read` with column-level partitioning — public columns to all, `role` and `is_disabled` only to self + admins. Requires either a view-based RLS pattern or splitting profile-sensitive data into a separate `profiles_admin_data` table.

**Not blocking.** Revisit during Phase I (admin/polish) or sooner if reach for hardening pass.

### K-002 — Accessibility pass needed before launch (medium)

Phase A.5 set up the foundation (focus rings via `focus-visible`, semantic HTML, ARIA labels on icon buttons) but a full accessibility audit hasn't been done. Things to check before launch (Phase J):
- Color contrast ratios on teal-on-white and verified-green-on-bg (WCAG AA 4.5:1)
- Keyboard navigation order through hero / categories / featured listings
- Screen reader pass-through on the search bar (location chip + submit button in same form)
- Image alt text once real product images are wired (Phase D)
- Reduced-motion preferences (currently `group-hover:scale-105` ignores `prefers-reduced-motion`)

Not blocking for Phase B onward. Owner / planner can add this to Phase J's scope.

### K-004 — No "delete account" flow

Phase B creates accounts but provides no way to delete one. RLS policies + cascade rules in Phase A's schema would technically allow it, but there's no UI. Buyers should be able to self-delete; sellers may need admin-mediated deletion to handle pending escrow/disputes (Phase H).

Not blocking for Phase B. Add in Phase I (admin/polish) or sooner if requested.

### K-006 — Recovery session doesn't sign out other sessions after password change

When a user resets their password via the recovery flow, their other active sessions (on other devices or browsers) remain signed in until their session tokens naturally expire (typically 1 hour for the access token, longer for refresh tokens).

If the password reset was triggered because someone else had access to the account (account compromise), the attacker's session stays valid until token expiry.

**Severity:** medium. Real security concern but with bounded blast radius (existing sessions can't refresh once the refresh token expires, and Supabase invalidates refresh tokens on password change in newer versions — needs verification for the version we're on).

**Fix when prioritized:** After successful password update, call `supabase.auth.signOut({ scope: "others" })` to invalidate all other sessions for that user. This is a single line addition to `updatePasswordAction` after `updateUser` succeeds.

**Not blocking for Phase B.7.** Add to Phase I (polish) or sooner if abuse surfaces.

<!-- K-007 resolved in Phase D.4 — see Resolved section below. -->


### K-009 — seller_verifications banking columns hold placeholder values (medium)

Phase A specced `seller_verifications` as a banking-verification table — `bank_account_number`, `bank_name`, `bank_account_holder` are all NOT NULL. Phase C.5 reuses the same table for **identity** verification (NIN, ID document, selfie, address) and has no banking info to put in those columns yet. The submit action inserts placeholder strings (`"PENDING"`) to satisfy the NOT NULL constraint.

**Severity:** medium. Identity verification works correctly; the placeholders are inert until Phase G builds the payout flow. But:
- An admin reading `seller_verifications` directly will see `"PENDING"` and might mis-read it as a real submission state.
- Future analytics or exports that count distinct `bank_name` values will be polluted.
- If Phase G expects to read pre-collected banking info from these rows, the assumption will silently fail.

**Fix when prioritized:** Phase G (Paystack Pro tier) should either:
- (a) ALTER the three banking columns to nullable, then UPDATE existing `"PENDING"` rows to NULL, then collect real values during Pro upgrade. Migration is straightforward.
- (b) Move banking info to a separate `seller_payout_accounts` table keyed on `business_id`; leave `seller_verifications` purely identity-focused.

Recommend (b) when Phase G arrives — cleaner separation of identity verification (one-time gate) from payout setup (per-tier, can change).

**Not blocking Phase C.5.** Identity verification + admin approval flow work correctly with the placeholders.

<!-- K-011 resolved per D-054 — see Resolved section below. -->


### K-010 — Orphan storage files on listing delete / image swap (low, deferred)

`product_images` rows are removed from the DB when a listing is deleted or an image is swapped during edit, but the corresponding Storage objects are removed via best-effort `storage.remove()` calls. If the Storage delete fails (transient network issue, RLS edge case), the row is gone but the file persists — an orphan.

**Severity:** low. Storage objects cost is negligible at v2 scale. No correctness impact (listings render via DB-driven `storage_path` lookups; orphans aren't referenced).

**Acknowledged:** Phase D.7.2 explicitly notes the orphan risk in `updateListingAction` and `deleteListingAction` Storage cleanup code paths.

**Fix when prioritised:** scheduled cleanup job that lists Storage objects under `product-images/{business_id}/{product_id}/` and removes any whose `product_id` no longer exists in `products`. Phase E or post-launch. Could run as a Supabase Edge Function on a schedule.

### K-012 — `revalidatePath` called in auth actions on Cloudflare edge (low)

**Symptom:** `signUpAction`, `signInAction`, and `signOutAction` in `src/app/(auth)/actions.ts` call `revalidatePath("/", "layout")` immediately before a `redirect()`. Per the banked MEMORY.md lesson, `revalidatePath` is broken on Cloudflare Pages edge — it silently fails (and would throw a visible 500 only if the action returned state instead of redirecting). Because all three redirect right after, the failure is invisible today.

**Severity:** low. No user-visible breakage — the subsequent `redirect()` navigates to a freshly-fetched page, which is the freshness mechanism that actually works on edge. The `revalidatePath` calls are simply dead/no-op on this platform.

**Surfaced:** Stage 2.A OTP audit (signup-flow read). Left untouched to keep the OTP work scoped.

**Fix when prioritised:** delete the three `revalidatePath("/", "layout")` calls; navigation-driven freshness via `redirect()` already covers it. Trivial, but verify no non-edge code path relies on them first.

### K-013 — OTP verify-attempt counter is read-then-write, not atomic (low)

**Symptom:** `verifyPhoneOtpAction` (`src/app/(auth)/otp-actions.ts`) increments `phone_verifications.attempts_made` via read-then-write (`update({ attempts_made: row.attempts_made + 1 })`). Concurrent wrong-code submissions for the same OTP can under-count, allowing up to ~6 attempts instead of the intended 5.

**Severity:** low. The brute-force margin is negligible — 6 vs 5 guesses against a 6-digit code is ~1-in-166,666 either way. No practical security impact.

**Surfaced + decided:** Stage 2.A Step 3/4. Deliberately deferred (decision B) because the atomic fix is disproportionate to the margin (see fix path).

**Fix path (Phase F+ hardening):** supabase-js can't express `attempts_made = attempts_made + 1`, so an atomic increment needs a `SECURITY DEFINER` Postgres function doing `UPDATE phone_verifications SET attempts_made = attempts_made + 1 WHERE id = $1 AND user_id = $2 RETURNING attempts_made;` — the action then checks the returned value `>= 5`. **Must apply the full anon/authenticated/PUBLIC triple-REVOKE + service_role grant lockdown** (see the SECURITY DEFINER lesson in MEMORY.md) and a §2d-style grant audit. DB-first migration before the action change.

## Resolved or superseded

### K-003 — Spam signups possible (email confirmation OFF) (RESOLVED)

**Resolution (confirmed 2026-05-20):** Production state is email confirmation **ON** (Supabase → Authentication → Providers → Email → Confirm email). The K-011 PKCE cross-browser fix shipped the working confirmed-email flow, so unconfirmed-email profiles can no longer be created — closing the original spam vector. Phase E Stage 2.A phone OTP adds a second proof-of-identity layer (gates contact-reveal + listing-creation on `phone_verified`). The `signUpAction` comment ("email confirmation ON (D-023)") matches reality and stays as-is.

### K-011 — Cross-browser PKCE email confirmation fails (RESOLVED)

The Supabase Dashboard "Confirm signup" email template now uses `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/dashboard` instead of the PKCE-coupled `{{ .ConfirmationURL }}`. Application code in `/auth/callback/route.ts` already handles `token_hash + type=signup` via `supabase.auth.verifyOtp` (the D-027 password-reset work made the callback type-agnostic).

The fix is server-state-verified rather than browser-cookie-coupled, so Browser A → email → Browser B works correctly. Trade-off documented in D-054: token_hash is slightly less protected against email-interception attacks than PKCE, but Nigerian buyers' cross-device email habit is the stronger reality.

**Resolved:** D-054. Closed by owner Dashboard template update + the existing callback handler. No application-code commit required.

### K-007 — Two `/categories` links currently 404 (RESOLVED)

Phase C shipped with home-page "View all" and category-page "← All categories" links pointing at `/categories` (no slug), both returning 404. Phase D.4 built the `/categories` index page (`src/app/categories/page.tsx`) — three-tier grid (6 Tier 1 cards prominent, 11 Tier 2 standard, 11 Tier 3 in `<details>` disclosure). Resolved in commit `ad35321`.

### K-008 — Phase C listing CRUD broken on actual schema (RESOLVED)

Phase C's listing creation and image management code referenced column names that did not exist in the actual database schema:

- `product_images.url` (actual: `storage_path`)
- `product_images.sort_order` (actual: `position`)
- `product_images.is_primary` (no such column)
- `products.slug` missing on INSERT (required, no default)

The bugs would have surfaced on first listing creation attempt. They didn't reach production because the `/sell` form failed with the `businesses.name` column bug first (separate hotfix `109eb51`).

**Root cause:** Phase C spec was written against an assumed schema, not the actual one. Audited and corrected during the Phase C.5 pre-flight schema review. Fixed in commit `1976827`.

**Resolved:** Phase C revision (commit `1976827`). `ACTUAL_SCHEMA.md` added to repo as source of truth to prevent recurrence.

### K-005 (was: verification_status not enforced) — superseded by D-032

The Phase C launch had no enforcement of `verification_status` on public-listing queries. This is being addressed structurally by Phase C.5's hard-gate model (D-032) rather than as a one-off bug fix. Tracked here for traceability; not a separate issue going forward.
