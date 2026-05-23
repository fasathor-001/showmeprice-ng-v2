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

**Scope note:** this issue is the *narrow, completable* task — transcribe the N missing policy bodies. The *broad* audit (re-verify every documented enum/column/policy against live `information_schema`/`pg_catalog`) is tracked separately as **K-032**.

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

### K-031 — `/dev/messaging-smoke` harness must be removed or admin-gated before public beta (low)

Stage 2.B Commit 1.5 added `src/app/dev/messaging-smoke/` — a dev-only harness that invokes the messaging server actions and renders their results, for verifying Commit 1 in isolation. It is guarded by `notFound()` when `NODE_ENV === 'production'`, so it 404s on the deployed site and is only reachable via `pnpm dev` on localhost (which shares the production Supabase instance).

**Severity:** low. Not reachable in production (hard 404 guard). It does, however, ship in the bundle and reads `filter_actions_log` via the service-role admin client (dev convenience).

**Resolution before public beta:** delete the route, OR replace the `NODE_ENV` guard with a `requireAdmin` gate if a persistent internal tool is wanted. Tracked so it isn't forgotten when the app goes to wider access.

Surfaced 2026-05-22 (Stage 2.B Commit 1.5).

### K-032 — Phase 3: full ACTUAL_SCHEMA reconciliation pass against live DB (medium)

ACTUAL_SCHEMA.md has drifted from deployed reality in several places, discovered during Stage 2.B prep. A systematic audit is needed before relying on the doc for any new schema-dependent work.

**Confirmed drift found so far (real, not false alarms):**
- `filter_rules.applies_to_context` / `applies_to_tier` documented as `jsonb` but actually **`text[]`** (caught by the E.2.3.0 §0 information_schema pre-flight; reverted in commit `07137b2`).
- `conversations` / `messages` columns, constraints, indexes, and the 8 RLS policies were materially under-/mis-documented vs the deployed schema (corrected in the Stage 2.B Commit A doc reconciliation).
- The blanket "Phase E.1.x RLS pending E.1.4" claim was stale — RLS is deployed across E.1.x (corrected; see K-028).
- `supabase_realtime` publication + `REPLICA IDENTITY FULL` on conversations/messages were already present with unknown provenance (K-030).
- **(appended 2026-05-23, Stage 2.B Commit 1.6 prep)** `profiles.verification_status` documented as scalar in places; actually **`text[]`** (multi-value array — `phone_verified`, future `email_verified`, etc.). Drizzle mirror is correct; doc copies elsewhere need audit.
- **(appended 2026-05-23)** `profiles.email` doesn't exist — email lives in `auth.users.email`. Several doc snippets and spec drafts referenced `profiles.email` as if it were a column.
- **(appended 2026-05-23)** `products` published-state model: there is NO `is_published` boolean column. The published state is the combination of `status='active'` (enum) + `published_at` timestamp. Doc references to `is_published` are stale and need scrubbing.
- **(appended 2026-05-23)** `conversations.listing_id` (not `product_id`) despite the FK pointing at `products(id)`. Stage 2.B spec drafts that said `product_id` are wrong; deployed schema and FK constraint name `conversations_listing_id_fkey` are canonical.
- **(appended 2026-05-23)** `filter_actions_log` column names: `rule_action` (not `action`), plus `user_proceeded` boolean and `context` columns the doc didn't transcribe.

**Note — `product_status` was a FALSE alarm:** ACTUAL_SCHEMA already documents it correctly (`draft / active / sold / archived`); the Stage 2.B Commit 1 "NotFound" was test-data/RLS, not doc drift.

**Severity:** medium. The doc has cost real debugging time; it's trusted by every future schema-dependent task, so its accuracy is load-bearing.

**Resolution scope (Phase 3):** systematically re-verify every documented item against the live database — table list + count, each column's `data_type`/`is_nullable`/`column_default` (`information_schema.columns`), every enum's values (`pg_enum`), CHECK/FK/unique constraints (`pg_constraint`), indexes (`pg_indexes`), RLS enable state + policy bodies (`pg_policies` — overlaps **K-028**), functions (`pg_proc`: `prosecdef`/`proconfig`), triggers, and publication/replica-identity state. Update ACTUAL_SCHEMA from the paste-backs. Pairs with the banked MEMORY lesson "rendered output is never authoritative — only information_schema is."

**Related:** K-028 (narrow policy-transcription subset), K-030 (publication provenance).

Surfaced 2026-05-23 during Stage 2.B Commit 1 smoke testing.

### K-033 — D-110 filter system: Phase 2/3/4 future work (medium)

Phase 1 ships in D-119 / Stage 2.B Commit 1.6: data-driven `filter_rules` additions for Nigerian-specific patterns (phone numbers, payment links, shortened URLs, telegram/signal, WhatsApp typos, off-platform handoff WARN, bank-platform references WARN). Phase 2/3/4 are deferred:

- **Phase 2 (required before public beta)** — normalization pipeline: Unicode NFC; number-as-words obfuscation ("zero eight zero two…" → digits); lookalike substitution (Cyrillic / Greek lookalike characters); whitespace/case normalization. Without this, the regex rules ship in D-119 can be trivially evaded.
- **Phase 3 (post-private-beta)** — heuristic risk scoring for ambiguous cases (e.g. a message with 3+ WARN flags should escalate even if no single rule blocks).
- **Phase 4 (Year 2+)** — ML classification trained on the real message corpus accumulated during private/public beta.

**Severity:** medium. Phase 1 (D-119) raises the filter bar significantly but does not close determined-adversary bypass paths. Public beta cannot ship without Phase 2.

**Resolution scope (Phase 2):** new `src/lib/messaging/normalize.ts` module invoked from `runMessageFilter` BEFORE regex matching. Unit-test coverage for the obfuscation patterns the regex rules don't catch. Re-run vitest with normalization on the existing ~40 D-119 cases to confirm no regressions.

**Related:** D-119 (Phase 1 — the data-driven rules this complements), D-110 (architecture).

Surfaced 2026-05-23 during D-119 design (adversarial smoke testing of Stage 2.B Commit 1).

### K-034 — Verified Payment Details upgrade (post-beta) (medium)

D-120 ships **"Payment Details Registered"** at MVP — a label indicating the seller has set up a payout account. The upgrade to **"Payment Details Verified"** (L4 in the D-120 verification hierarchy) requires:

- **Paystack Account Name Inquiry API integration** — query Paystack's `/bank/resolve` endpoint with the registered account number + bank code to retrieve the account holder name as Paystack sees it.
- **Name-match check** — compare the Paystack-returned name against the seller's registered `account_name` (and optionally against `profiles.full_name` collected during identity verification). Match strategy: case-insensitive token-set similarity (Levenshtein or token-set ratio), threshold TBD.
- **Admin review queue for mismatches** — flagged accounts surface in `/admin/payment-details-review` with the Paystack-returned name vs registered name + side-by-side; admin approves with override or rejects.
- **"Payment Details Verified" badge** — visually distinct from "Payment Details Registered"; surfaces in conversation thread + seller profile.
- **L4 verification level activation** — D-116 verification level computation reads from `seller_payout_accounts.verified_at` (column added in this upgrade).

**Severity:** medium. Adds before public beta to differentiate trust signals — "Registered" alone is a weaker signal than buyers may infer.

**Resolution scope (post-beta):** Paystack API client (server-only, service-role), admin review UI, migration adding `verified_at` + `verification_method` + `verified_by_admin_id` columns to `seller_payout_accounts`, RLS policy updates, vitest coverage for the name-match function.

**Related:** D-120 (registered payment details), D-116 (verification level hierarchy), K-035 (change cooldown — pairs with verified-state invalidation on change).

Surfaced 2026-05-23 during D-120 design.

### K-035 — Payment Details change cooldown (post-beta) (medium)

D-120 allows re-share with buyer warnings on supersession, but there is **no system-enforced cooldown** on seller account changes. A seller can update their payout account immediately, re-share, and prior buyers see only a single warning. This leaves a "trusted account replaced later" fraud pattern open: gain trust with account A, share with high-value buyer, swap to account B mid-deal.

**Resolution scope (post-beta):**
- Add `seller_payout_accounts.previous_account_snapshot JSONB` to capture the prior values on each UPDATE (encrypted, snapshot identical shape to `payment_detail_shares.account_snapshot`).
- Add `seller_payout_accounts.cooldown_until TIMESTAMPTZ` — set to `NOW() + INTERVAL '14 days'` on UPDATE.
- New shares during a cooldown window are explicitly flagged in the buyer view: "⚠️ Seller updated payment details X days ago. The previous account was: [bank] / [last-4-digits] / [account-name]."
- Previous buyers (with non-superseded shares) get a one-time push/email notification on change (Phase E.notification work).
- Admin review queue for shares created during cooldown.

**Severity:** medium. Required before public beta to prevent fraud pattern. Not blocking private beta.

**Related:** D-120 (registered payment details — base mechanism), K-034 (verified payment details — verification state invalidation on change), D-114 (anti-abuse).

Surfaced 2026-05-23 during D-120 design.

### K-036 — Listing-level filter enforcement: wire CREATE/EDIT actions (medium)

**Reframed 2026-05-23 after E.2.6.0 §0 paste-back.** Production data already carries listing-context filter rules for the major rule types (phone, signal_link, social_handle, telegram_link, whatsapp_link, payment_url, shortened_url, email, nuban — all have `applies_to_context = ARRAY['listing_description']` rows in production). The data side is **already partially populated** from the E.1.5 seed and E.2.3.0 reconciliation.

What's missing is the **code wiring**: listing CREATE/EDIT server actions in `src/lib/listings/actions.ts` (and any listing-edit Server Actions) do NOT currently invoke `runMessageFilter(content, tier, 'listing_description')`. The listing-context filter rules in production are unenforced data right now.

**Severity:** medium. Required before public beta. A determined seller can move bypass content from chat to the listing description (which buyers see without any filter mediation).

**Resolution scope:**
1. **Code path verification (first step):** grep `runMessageFilter` callers — confirm zero callers in listing actions (Commit 1 wired only messaging actions).
2. Add a listing-context entry to `runMessageFilter` signature (default `'message'` for backward compat) OR a new `runListingFilter(content, tier)` helper.
3. Invoke from listing CREATE action + listing EDIT action; reject on block, set `metadata.contains_warning` on warn (similar to messages but at the listing row level — needs schema decision: where does the warning flag live on listings? A new column on `products`?).
4. Add ~10 vitest cases for listing-context filtering.
5. Manual smoke: create/edit listing with each blocked pattern (NUBAN, payment URL, etc.) — verify rejection.

**Estimated effort:** 2-3 hours.

**Open question (resolve during this commit):** D-119 also wants email/social handles/off-platform language UPGRADED from message-WARN to listing-BLOCK. The data may already reflect this (production has `social_handle | block | listing_description` per §0), so verify and align rather than presume new rows are needed.

**Related:** D-119 (filter expansion — message context shipped in Commit 1.6, listing context deferred here), D-110 (architecture).

Surfaced 2026-05-23 during D-119 design; reframed after E.2.6.0 §0 paste-back revealed data is already partially populated.

### K-038 — `filter_actions_log` doesn't capture BLOCK events (HIGH, pre-private-beta)

Stage 2.B Commit 1.6 smoke testing (2026-05-23) confirmed: 7+ BLOCK events fired at `sendMessage`/`createConversation` level during production smoke. **Zero** rows landed in `filter_actions_log` for those blocks. Only WARN events log (4 entries from the same session match).

**Root cause (verified by inspection):** the `logFilterAction(...)` call in `src/lib/messaging/actions.ts` sits AFTER the early `return { error: "ContentBlocked" }` in both `createConversation` and `sendMessage`. When a message is blocked, control returns before logging. The helper itself (`src/lib/messaging/filters.ts:logFilterAction`) handles block events fine — it only short-circuits on `action === "allow"`. The bug is in the call-site sequencing.

**Impact:**
1. Admin review can't see attempted policy violations (the most important signal for tuning D-119 rules).
2. D-119 repeat-violation escalation thresholds (1st → 4th → 7th, per D-114) have no data to operate on.
3. K-029 whitelist exemptions can't be audited (we can't tell which prices triggered the suppression).
4. Fraud pattern analysis dataset is incomplete — blocks are exactly the events we most need to study.

**Severity:** HIGH. Required before private beta — without this, the moderation feedback loop is blind to its own enforcement.

**Resolution scope:** ~10 LOC change in `src/lib/messaging/actions.ts`:
- In `createConversation`, BEFORE `return { error: "ContentBlocked", reason: blockReason(filter.rule) }`, add a best-effort `await logFilterAction({ userId: actor.user.id, messageId: null, result: filter, content, userProceeded: false })`.
- Same change in `sendMessage` (before its `ContentBlocked` return).
- Existing post-success `logFilterAction` calls (with `userProceeded: true`) stay.
- Update vitest if any assertion depends on `logFilterAction` call sequencing (unlikely — current tests don't mock it).

**Smoke verification after fix:** trigger one block via `/dev/messaging-smoke`, then `SELECT * FROM filter_actions_log WHERE rule_action='block' ORDER BY created_at DESC LIMIT 5` should show the row with `user_proceeded = false` and `context_id IS NULL`.

**Related:** D-119 (smoke testing surfaced this), D-114 (repeat-violation escalation depends on this data).

Surfaced 2026-05-23 during D-119 production smoke testing.

### K-039 — Deposit-request / pre-payment-demand detection (D-119 Phase 2 candidate, medium)

Pre-payment demand language like *"deposit before delivery"*, *"pay 50% upfront to secure"*, *"reservation fee to lock in"* doesn't contain a payment INSTRUMENT (no account number, no payment link) but explicitly signals one of the highest-frequency Nigerian marketplace fraud patterns: ask for partial payment before goods are seen, then disappear.

Current D-119 patterns (regex on accounts, links, off-platform handoff, bank brand names) don't catch these because the linguistic surface is INTENT, not artifacts. A normalized phrase-match — even a simple keyword combo — would catch the obvious cases.

**Pattern brainstorm (not final):** `(deposit|upfront|advance|reservation\s+fee|holding\s+fee|lock\s+in|secure)\b.*\b(pay|send|transfer|before|first|now)` and the mirror order. WARN-tier in messages — "Deposits before inspection are the most-reported scam pattern on ShowMePrice. If you proceed, only deposit through a method you can dispute (Paystack escrow when shipped — D-082)." BLOCK-tier in listings.

**Severity:** medium. Required pre-public-beta. Conversational vocabulary (Frank's distinction: *vocabulary* vs *instrument*), so WARN at message level mirrors the bank_platform_ref policy — but at listing level, escalates to BLOCK because public listings shouldn't advertise deposit demands.

**Resolution scope:**
- Bundle with K-033 Phase 2 normalization work (number-as-words obfuscation, Unicode NFC, lookalike substitution). All three are "linguistic pre-processing" rather than artifact-regex extensions.
- Add new rule_type `deposit_demand` (warn @ message, block @ listing) once K-036 listing-context enforcement code path is wired.
- Vitest cases: legitimate "I need to deposit cash at GTBank tomorrow" (allow — banking-vocabulary precedent, no payment-verb proximity) vs scam pattern "pay 50% deposit before delivery" (warn).

**Related:** D-119 (scope this expands), K-033 (normalization pipeline pairing), K-036 (listing-context wiring), D-114 (anti-abuse policy).

Surfaced 2026-05-23 during D-119 production smoke testing.

### K-037 — K-029 NUBAN whitelist: tighten to adjacency-based price-context (low)

Commit 1.6 (D-119) flips `nuban` from WARN to BLOCK in message context. The K-029 whitelist guard in `runMessageFilter` had to extend from warn-only to apply to both actions, otherwise legitimate ₦1B+ prices (10-digit naked amounts) would be hard-blocked.

The current `isLikelyPriceContext` heuristic is **message-wide** — any "last price" / "negotiable" / "₦"-prefix anywhere in the message suppresses the NUBAN match. This was acceptable at warn-tier (over-suppression of a warn is low-harm) but is exploitable at block-tier: a determined scammer can craft *"send to 1234567890 — last price"* and the NUBAN-block fires its suppression on the unrelated "last price" tail.

**Resolution scope (post-private-beta):**
- Tighten `isLikelyPriceContext` to check **adjacency**: the price marker (₦ / N / "naira" / comma-format) must be within N characters of the matching digit-run, not anywhere in the message.
- Possible implementation: regex with capture-group, or a two-pass match locator that confirms the digit-run's neighborhood.
- Re-run vitest with the tighter logic and add false-negative cases for cleverly-worded scam attempts.

**Severity:** low. The current K-029 implementation extends safely to block-tier; the exploit requires deliberate crafting and most legitimate ₦1B+ price messages will still pass. Tightening is a refinement, not a blocker for private beta.

**Related:** K-029 (NUBAN price-context whitelist — original warn-only spec), D-119 (Commit 1.6 — the trigger for extending K-029 to block-tier).

Surfaced 2026-05-23 during D-119 / Commit 1.6 design.

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
