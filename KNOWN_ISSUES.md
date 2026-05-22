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

### K-015 — Middleware auth-only redirect doesn't apply the phone-verify gate (low)

**Symptom:** `middleware.ts` redirects a *signed-in* user who visits an auth-only route (`/sign-in`, `/sign-up`, `/forgot-password`) to `/dashboard` (hardcoded, line 50-55), bypassing the Stage 2.A phone-verify soft-prompt.

**Severity:** low. Rare path — a signed-in user manually revisiting auth-only pages. Edge case acceptable because Step 5's `requirePhoneVerified()` gates catch unverified users at the actual point of impact (listing creation, contact reveal).

**Fix declined for now:** would require a `profiles.verification_status` query inside middleware, which runs on most requests — wrong trade for a rare edge case. Revisit if it matters.

### K-021 — `freeze_profile_role` lacks `SET search_path = public` (low)

**Symptom:** The `freeze_profile_role` trigger function (updated in E.2.2.0 / D-105 to add the GUC-guarded bypass branch) does not pin `SET search_path = public`. Every other SECURITY DEFINER function on this codebase (`mark_phone_verified`, `grant_admin_role`, `revoke_admin_role`, `get_buyer_reveal_cap`, `compute_escrow_fee`) pins search_path; this trigger function predates that discipline and was deliberately left as-is during E.2.2.0 to avoid changing unrelated behavior in the same migration.

**Severity:** low. The body references only unqualified `profiles` plus `current_setting`/`auth.uid()`; exploiting it would require creating a same-named object in an earlier-resolving schema AND getting it onto the function's search_path — not possible via the exposed API at v2 scale.

**Surfaced + deferred:** Stage 2.A.1 (E.2.2.0, 2026-05-22). Deliberately deferred to a future hardening pass.

**Fix when prioritised:** `CREATE OR REPLACE FUNCTION freeze_profile_role() ... SET search_path = public` (online, no lock). Apply alongside any future touch of the trigger; consider auditing all trigger functions for the same gap in the same pass.

### K-022 — E.2.2.0 migration §2c verification query uses `polname` (low, verification-only)

**Symptom:** In `migrations/E.2.2.0-admin-role-provisioning.sql`, the §2c RLS verification query selected `polname` from `pg_policies`, but `pg_policies` exposes the column as `policyname` (`polname` is the column on the lower-level `pg_policy` catalog). Re-running §2c as originally written errors with `column "polname" does not exist`.

**Severity:** low. **Verification-only** — does NOT affect the applied migration (§1 ran clean and was confirmed by the other §2 queries + the §2h behavioral tests). Only a §2c re-run was affected.

**Fixed:** the in-place `polname → policyname` correction landed in the Commit 6 docs sweep (2026-05-22), same commit as this entry. The deployed schema was never wrong — only the verification SQL text.

**Surfaced:** during the previous session's E.2.2.0 verification paste-back; banked here for traceability.

### K-023 — Expired/consumed confirmation link redirects to /sign-in without explanation (medium-low)

When a user clicks a Supabase email confirmation link that has already been used (single-use consumed) or expired (>24h), the user is redirected to /sign-in with no specific messaging about what happened. Creates user confusion: "Did I do something wrong?", "Was my account not confirmed?", "Is the system broken?"

Discovered during Stage 2.A.1 smoke test 2026-05-22 when re-clicking the confirmation link for `admin@showmeprice.ng` (already consumed during the original confirmation flow that triggered admin bootstrap).

**Resolution scope:** build a small error-state page or enhance /sign-in with conditional messaging based on auth error params. Two cases to handle:
1. Link already consumed (account is fine, just sign in)
2. Link expired (request a new confirmation email)

Estimated 1-2 commits. Affects every user who signs up (not admin-specific). Not blocking Stage 2.A.2 but should resolve before public launch. Separate concern from D-106 (admin navigation).

Surfaced 2026-05-22 during Stage 2.A.1 smoke test by Frank.

### K-024 — No admin navigation entry point; admins must type URLs directly (medium)

Admin users can access /admin/verifications and /admin/users only by typing the URL directly. No visible navigation entry point exists for admin features (header link, dropdown, dashboard widget, etc.).

D-105 banked the admin provisioning mechanism but did not include the navigation entry point — a scoping miss in D-105 that became visible during Stage 2.A.1 smoke test.

**Resolution:** D-106 (banked 2026-05-22) — Stage 2.A.2 covers admin navigation with single header link + /admin landing page + minimal visual treatment.

Estimated 1-2 commits. Required before launch. Blocks Stage 2.B kickoff per D-106 §1.

Surfaced 2026-05-22 during Stage 2.A.1 smoke test by Frank: "admin account is suppose to have admin button for admin to access admin page not visiting the link directly".

### K-026 — No back-navigation link from /admin sub-pages to /admin landing (low)

After clicking a card on /admin landing (User Management or Business Verifications), admins land on the corresponding sub-page with no visible link to return to /admin. Admins must use the browser back button or the UserMenu dropdown.

UX polish item, not blocking. Browser back works as fallback. Worth resolving before public launch.

Resolution scope: add "← Back to Admin" link or breadcrumb at top of /admin/staff/page.tsx and /admin/verifications/page.tsx. Single small commit. Mirrors any existing back-link pattern in the codebase if one exists.

Surfaced 2026-05-22 by Frank during Stage 2.A.3 smoke test.

### K-027 — grant_admin_role SQL function lacks is_disabled check; defense is at action layer only (low)

The `grant_admin_role` SECURITY DEFINER function (E.2.2.0 migration) checks target existence, already-admin status, and granter activity, but does NOT check whether the target's account is disabled (`is_disabled=true`). Current defense against granting admin to disabled users lives at the `grantAdminAction` server action layer (added in Stage 2.A.3, commit f412dab).

Defense-in-depth concern: the deepest DB-layer guard would be a migration adding an `is_disabled` check inside `grant_admin_role`. The action-layer guard is sufficient for normal app flow but doesn't protect against direct DB execution by service_role contexts that bypass the action.

Pattern parallel to K-021 (`freeze_profile_role` missing `SET search_path = public`). Both are SECURITY DEFINER hardening items worth bundling into a future hardening pass.

Resolution scope: small migration that `CREATE OR REPLACE`s `grant_admin_role` with an `is_disabled` check; behavioral test in §2h to confirm. Defer to a future hardening session.

Surfaced 2026-05-22 during Stage 2.A.3 implementation by the coding agent.

### K-028 — ACTUAL_SCHEMA missing policy bodies for ~19 deployed E.1.x tables (low)

Phase 1 verification (2026-05-22) confirmed **29 public tables have RLS policies deployed**, but ACTUAL_SCHEMA's "RLS Policies" section documents policy bodies only for the Phase A/C.5 tables plus (now) `conversations` + `messages`. Roughly **19 E.1.x tables have deployed policies whose bodies are not transcribed** in the doc: `admin_action_log`, `admin_emails`, `admins`, `admin_role_changes` (1 each), `blocks` (4), `credit_balances` (2), `filter_actions_log` (2), `filter_rules` (2), `notification_log` (3), `notification_preferences` (3), `payments` (2), `price_history` (1), `reports` (3), `saved_listings` (5), `search_query_log` (2), `tier_features` (2), `user_tier_history` (2).

**Severity:** low. Policies ARE deployed and enforced — this is a documentation-completeness gap, not a security gap. The actively-misleading part (the blanket "RLS pending E.1.4" claim) was fixed in the D-108/109/110 docs commit.

**Resolution scope:** a doc-completeness pass that queries `pg_policies` for each table and transcribes the bodies into ACTUAL_SCHEMA with paste-back verification. Not blocking Stage 2.B.

Surfaced 2026-05-22 during Phase 1 verification.

### K-029 — NUBAN filter pattern `\b\d{10}\b` false-positives on any 10-digit number (low)

The `nuban` filter rule (now `warn` in messages per E.2.3.0 / D-110) uses pattern `\b\d{10}\b`, which matches *any* 10-digit run — not just bank account numbers. It will warn on prices, order IDs, product codes, and phone numbers written without a country code. In MVP it only produces an over-eager **warning** (not a block), so the blast radius is small, but it adds friction noise.

**Severity:** low. Warn-only (E.2.3.0); no block. UX-noise, not correctness/security.

**Resolution scope:** the Phase 3+ send-message action that runs content through the filter must apply a context-aware whitelist (§10 price/negotiation whitelist — `₦450k`, `450,000`, etc.) before surfacing the NUBAN warning, and ideally narrow the pattern (e.g. exclude values adjacent to currency markers). Application-layer concern, not a rule-row change.

Surfaced 2026-05-22 during E.2.3.0 reconciliation prep.

### K-030 — supabase_realtime publication + REPLICA IDENTITY FULL on conversations/messages: provenance unknown (low)

Discovered 2026-05-22 during E.2.4.0 §1 execution. Production `conversations` + `messages` were **already** in the `supabase_realtime` publication with `REPLICA IDENTITY FULL`, despite Phase 1 query 10 + E.2.4.0 §0a both returning 0 rows for publication membership. §1's first `ALTER PUBLICATION ... ADD TABLE` errored `42710` (already-member); the transaction rolled back cleanly (so our `REPLICA IDENTITY FULL` statements never ran — that state pre-existed too). The post-rollback re-query confirmed both tables present + FULL.

**Severity:** low. Production is in the correct end state for Stage 2.B (the planned E.2.4.0 migration was a no-op and was not shipped). This is a provenance/observability question, not a correctness gap.

**Resolution scope (future session):** check Supabase project settings for any auto-realtime-configuration behavior; inspect Supabase logs for publication/replica-identity ALTER operations around the E.1.x table-creation dates; determine whether the SQL Editor read-query inconsistency is reproducible. Pairs with the MEMORY "rendered output / empty result sets are not authoritative" lesson.

Surfaced 2026-05-22 during E.2.4.0 execution.

## Resolved or superseded

### K-019 — Phone validation gap + NG-only-vs-international product decision (RESOLVED)

**Product decision resolved by D-114** (2026-05-22): international phones are allowed — any valid international phone can verify; `+234` verified buyers get automatic free reveals; non-`+234` verified buyers can browse/message but free reveals require admin approval during beta (post-launch can be automated once policy is stable). Phone is the primary identity gate; numbers are normalized before storage (`+234` ≡ `0` prefix) and unique (one phone = one account; banned numbers cannot be reused).

The original "validator should reject non-NG numbers" framing is **superseded** — accepting a non-NG number is now intended behavior, not a bug. The phone-handling implementation (normalization, uniqueness, `+234`-vs-international free-reveal gating per D-114) is **forward Phase 3 work**, not an open defect.

**Resolved:** 2026-05-22 (D-114). Surfaced 2026-05-21 during Stage 2.A SMS smoke validation.

### K-025 — /admin/users displayed grant buttons on every non-admin user row; didn't scale (RESOLVED)

Resolved by **D-107** (Stage 2.A.3) shipped in commit `f412dab`. Renamed /admin/users to /admin/staff, scoped to admin users only, replaced row-level grant buttons with a header-level "Grant admin role" button + inline-expand search-and-grant panel. Search excludes existing admins and disabled users; the 200-cap on `auth.admin.listUsers` is documented in `searchUsersAction` code.

End-to-end production smoke test confirmed: search returns matches by name/email, the grant flow promotes a user with reason + audit trail, the panel auto-collapses on success and refreshes the list. K-024 (admin nav entry point) was also resolved by D-106 (Stage 2.A.2) in commit `720fcd9`.

### K-020 — Admin role provisioning has no app-level path (RESOLVED)

Resolved by **D-105** (admin role provisioning, Stage 2.A.1) and its commit chain:
- `4460e88` — D-105 banked
- `80e4913` — E.2.2.0 migration: `admin_role_changes` audit table, `grant_admin_role` + `revoke_admin_role` SECURITY DEFINER functions (triple-REVOKE'd), GUC-guarded `freeze_profile_role` bypass
- `73a37ce` — bootstrap detection (`maybeBootstrapAdmin`, wired into `/auth/callback` + `signInAction`)
- `fa0929f` — shared `requireAdmin` + `grantAdminAction` / `revokeAdminAction`
- `ff83c69` — `/admin/users` UI (grant/revoke flow)

The first admin is now provisioned by matching `ADMIN_BOOTSTRAP_EMAIL` on signup/signin (no SQL workaround); subsequent admins are granted/revoked via `/admin/users`, with self-revoke and last-admin protection at both SQL and UI layers, every change audited in `admin_role_changes`.

**End-to-end validated in production 2026-05-22:** bootstrap fired for `admin@showmeprice.ng`; the two pre-existing test admins (originally provisioned via the SQL trigger workaround) were revoked through the new UI — confirming the revoke path end-to-end. End state: one active admin.

**Production note:** `ADMIN_BOOTSTRAP_EMAIL` must be set in Cloudflare Pages env vars before the next production deploy (local dev validated; production not yet).

### K-018 — /verify-phone Skip loop on hard-gated destinations (RESOLVED)

When an unverified seller clicked "New listing" → `/listings/new` redirected to `/verify-phone?next=/listings/new` → the user clicked "Skip for now" → Skip routed to `/listings/new` → the gate re-fired → redirected to `/verify-phone` again. Infinite loop with no escape. Resolved by **D-103**: two-mode page (soft vs required), with required mode replacing Skip with a "Not ready? Go to dashboard" escape link. Found via Step 5 smoke testing 2026-05-21. **Resolved:** 2026-05-21 (the two-mode /verify-phone commit).

### K-016 — Auth email links used the env Site URL, not the request origin (RESOLVED)

**Symptom:** `signUpAction` and `requestPasswordResetAction` built their email-redirect URLs from `process.env.NEXT_PUBLIC_SITE_URL ?? <hardcoded prod>`. In local dev (where the env var points to / defaults to production), the confirmation + password-reset email links pointed at the production domain — so local signups couldn't complete email confirmation against localhost, blocking local end-to-end testing. Downstream effect: the seller-promotion in `/auth/callback` never ran locally, leaving local seller signups stuck at the `user_type='buyer'` trigger default (the suspected cause of the K-017 candidate).

**Note:** `emailRedirectTo`/`redirectTo` *were* being passed — the bug was the **origin source** (env, not request), not a missing redirect param.

**Fix:** extracted `resolveRequestOrigin()` — prefers the request `Origin` header (local dev → localhost, prod → prod, automatically), falls back to `NEXT_PUBLIC_SITE_URL`, and **throws** if neither is set (a silent hardcoded fallback would mask misconfiguration). Applied to both `signUpAction` and `requestPasswordResetAction`. Safe against `Origin` spoofing because Supabase validates the redirect against its dashboard Redirect-URLs allowlist.

**Resolved:** 2026-05-21 (the `resolveRequestOrigin` commit, `00d92c7`).

**Collapsed candidate K-017 (not a separate bug):** a smoke-test account (`fasathor+selling@gmail.com`) appeared to sign up as a seller but landed with `profiles.user_type='buyer'`. Tracing the flow — `SignUpForm.tsx` (buyer/seller toggle → `userType` hidden input) → `signUpAction` (stashes `user_type` + business fields in `raw_user_meta_data`) → `handle_new_user` trigger (creates the profile at the `user_type='buyer'` DEFAULT, *ignores* `user_type`) → `/auth/callback` (the ONLY place seller promotion runs) — showed signup captured everything correctly (`raw_user_meta_data` had `user_type:'seller'` + `business_name` + `business_state_id`). The profile stayed `'buyer'` purely because K-016 routed the confirmation link to production, so the **production** `/auth/callback` consumed the one-shot token while the **local** callback never ran the promotion. K-016's fix resolves both symptoms. The account is unrecoverable for local seller testing (token already consumed); re-test with a fresh email. No separate code change needed.

### K-014 — Phone-verify soft-prompt missed signInAction (RESOLVED)

**Symptom:** The Stage 2.A verify-phone soft-prompt was wired only into `/auth/callback`. Standard email+password sign-in (`signInAction`) bypasses `/auth/callback` and hardcoded `redirect("/dashboard")`, so existing accounts with phone unverified were never routed to `/verify-phone`. Caught in pre-Step-5 smoke testing (a test account with `verification_status=[]` landed on `/dashboard`).

**Root cause (vulnerability class):** the routing decision was inlined in one of two parallel post-auth paths; the second drifted — the same "two places drift" failure the shared-helper pattern exists to prevent.

**Fix:** extracted the pure helper `phoneGateDest(verificationStatus, baseDest)` to `src/lib/auth/post-auth.ts` and applied it in BOTH `/auth/callback` and `signInAction`. Single source of truth for the gate decision.

**Resolved:** 2026-05-20 (same commit as the Step 4 two-state UX fix).

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
