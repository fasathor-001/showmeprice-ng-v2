# DECISIONS.md

Architectural decisions. Append-only. Never edit a prior entry; supersede it with a new one.

## D-001: Rebuild rather than refactor v1

**Context:** v1 was a Vite + React SPA on Supabase. Functionally working but with structural issues: SPA blocks SEO; role state cached inconsistently across localStorage and React; schema drift; Pro reveal flow re-broken multiple times.

**Decision:** Greenfield v2 rebuild on Next.js + fresh Supabase project. Keep brand (teal #2D9D9F), domain understanding, lessons. Discard v1 implementation.

**Why:** No deadline pressure. SPA architecture incompatible with SEO-led growth. Schema drift indicated cleanup cost approached rebuild cost.

## D-002: Framework — Next.js 14 App Router

**Decision:** Next.js 14 with App Router.

**Why:** Officially supported by `@cloudflare/next-on-pages` (Next.js 15 has caveats; Next.js 16 unsupported). SSR fixes the SEO problem from v1. App Router is the current Next.js direction.

## D-003: Backend — fresh Supabase project

**Decision:** Fresh Supabase project. Migrations designed from scratch.

**Why:** v1's schema has known drift (phantom columns, half-applied migrations, weird names). Reusing it imports the mess.

## D-004: Role model — Model B

**Decision:** Every user starts as buyer. "Seller" is a superset of "buyer," reachable via an upgrade flow.

**Why:** Matches Nigerian market reality. Asymmetric verification requirements. Most users will never sell. Sellers continue to buy from other sellers.

## D-005: Role canonical column — `user_type`

**Decision:** v2 uses `profiles.user_type` as the canonical user kind. `profiles.role` is reserved for admin elevation only (NULL for non-admins, 'admin' for admins).

**Why:** Single source of truth. Eliminates the v1 dual-column bug class.

## D-006: No localStorage role hints

**Decision:** v2 reads role from the server on every request. Client receives role as a Server Component prop.

**Why:** Performance cost is minimal. Bug surface is zero. v1's `smp:role_hint` caused weeks of bugs.

## D-007: Verification status on `businesses`, not `profiles`

**Decision:** `businesses.verification_status` is canonical.

**Why:** Domain match (verification is of a business). Avoids the v1 phantom-column bug.

## D-008: Naira-only

**Decision:** All prices in NGN. No multi-currency abstraction.

## D-009: WhatsApp number format

**Decision:** Phone numbers stored as E.164 without the `+` (e.g. `2348012345678`). WhatsApp `wa.me/` URLs need exactly this format.

## D-010: Cloudflare Pages, not Vercel

**Decision:** Deploy to Cloudflare Pages.

**Why:** Owner is already on Cloudflare; cost predictable; edge network has Nigerian presence.

## D-011: Node 20 LTS, pnpm 9.x

**Decision:** Pin Node to `>=20.0.0 <21.0.0` and pnpm to `>=9.0.0 <10.0.0`. Use `"packageManager": "pnpm@9.15.9"` in package.json. `.nvmrc` pinned to 20.

**Why:** Cloudflare Pages' build runtime is Node 20.

## D-014: Cloudflare Pages, not Workers

**Decision:** Deploy via `@cloudflare/next-on-pages` to Cloudflare Pages (`*.pages.dev`), not via `@opennextjs/cloudflare` to Workers (`*.workers.dev`).

**Why:** An earlier kickoff attempt switched to Workers + OpenNext on Cloudflare's stated recommendation. That path produced cascading failures specific to Windows + Node tooling + pnpm + OpenNext bundling. The Pages path is familiar to the owner, has a Git-connected auto-deploy via dashboard (no CLI deploy step), and is well-documented. Cloudflare has signaled Pages is deprecated for Next.js, but the deprecation is directional, not immediate. We accept this trade and revisit if/when the deprecation timeline becomes urgent.

**Numbering note:** D-012 and D-013 were used in the earlier (reverted) Workers attempt. They are intentionally skipped here to preserve the lesson that those decisions were considered and reversed.

## D-015: Pin @cloudflare/next-on-pages to 1.13.15 (not 1.13.16)

**Context:** After kickoff, two peer-dependency warnings surfaced:
- `unmet peer next@">=14.3.0 && <=15.5.2": found 14.2.35`
- `unmet peer vercel@">=30.0.0 && <=47.0.4": found 54.0.0`

The first one is unsatisfiable on Next.js 14: **Next.js 14.2.35 is the highest 14.x version ever published.** After 14.2.35, the Next.js team jumped straight to 15.0.0. There is no 14.3.x, no 14.4.x. The `next >=14.3.0` peer declared by `@cloudflare/next-on-pages@1.13.16` is almost certainly an upstream typo (possibly meant `>=15.3.0`).

`@cloudflare/next-on-pages@1.13.15` (the prior patch) declares no `next` peer at all and no upper bound on `vercel`. Adapter behavior between 1.13.15 and 1.13.16 is a patch-level change — no functional difference for our use case.

**Decision:** Pin `@cloudflare/next-on-pages` to `1.13.15`. Keep `next@14.2.35` (the security-patched current 14.x; see Next.js Security Update 2025-12-11). Keep `vercel@^54`. D-002 (Next.js 14) stands unchanged.

**Why:** Cheapest, lowest-risk fix that restores the no-peer-warnings invariant the planner wanted. Downgrading one patch level of the adapter beats either (a) bumping to Next 15 (reverses D-002 for an unrelated typo) or (b) leaving warnings in place (defeats the point of this fix).

**Revisit when:** Cloudflare publishes `@cloudflare/next-on-pages@1.13.17+` with a corrected peer range, OR if the adapter is fully deprecated and we need to evaluate alternatives.

## D-017: Column freezes via triggers, not RLS WITH CHECK

**Context:** Initial RLS policies attempted to freeze `profiles.role` and `businesses.verification_status` using `WITH CHECK (... IS NOT DISTINCT FROM (SELECT ... WHERE id = profiles.id))`. This pattern doesn't work — the subquery resolves against the new row in `WITH CHECK`, comparing the new value to itself.

**Decision:** Column freezes implemented via `BEFORE UPDATE` triggers with `OLD`/`NEW` comparison. RLS enforces row-level ownership; triggers enforce column-level admin-only writes. Triggers run as `SECURITY DEFINER` and check `auth.uid()` against an admin lookup.

**Why:** PostgreSQL RLS policies don't have access to `OLD` row values — only the new row in `WITH CHECK` and the current row in `USING`. Triggers are the textbook PostgreSQL pattern for "only certain roles can change column X."

**Pattern applies to:** `profiles.role`, `businesses.verification_status`. Future column freezes follow the same pattern.

## D-016: Drizzle for schema/types, Supabase client for runtime queries + auth

**Decision:** Drizzle ORM defines schema (`src/db/schema/*.ts`) and generates migrations (`supabase/migrations/*.sql`) and TypeScript types. `@supabase/ssr` handles auth and provides server/client Supabase clients used for runtime queries from Server Components and Server Actions. A separate Drizzle pooled client (`src/lib/db.ts`) exists for typed query patterns that benefit from Drizzle's API.

**Why:** Each tool used for what it's best at. Drizzle's migration tooling and types are excellent. Supabase's auth integration with Next.js App Router via `@supabase/ssr` is purpose-built and mature. Mixing them avoids fighting either.

**Constraints baked in:**
- Drizzle reads `DATABASE_URL` for migrations
- Drizzle pooled client reads `DATABASE_URL_POOLED` at runtime with `prepare: false`
- Supabase clients read `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for normal auth flows
- Service role client uses `SUPABASE_SERVICE_ROLE_KEY` for admin tasks only

## D-018: Session Pooler for migrations, Transaction Pooler for runtime (IPv4-compat correction to D-016)

**Context:** D-016 specified `DATABASE_URL` as the Supabase Direct Connection (port 5432, `db.<ref>.supabase.co`) and `DATABASE_URL_POOLED` as the Transaction Pooler (port 6543). On execution this failed: Direct Connection is IPv6-only by default, and the owner's development network is IPv4-only (typical Nigerian residential ISP). The seed script hit `ENOTFOUND` on the direct hostname.

**Decision:** Both DATABASE_URL variables now point at Supabase's connection pooler hostname (`aws-0-eu-west-2.pooler.supabase.com`):
- `DATABASE_URL` → Session Pooler, port 5432 — used for migrations, seed scripts, and any local-dev DDL. Supports prepared statements and DDL.
- `DATABASE_URL_POOLED` → Transaction Pooler, port 6543 — used for runtime queries via `postgres-js` with `prepare: false`. The constraint that prepared statements don't work in transaction mode is unchanged.

**Why:** Avoids the IPv6-only Direct Connection. Both options work from IPv4-only networks. Session Pooler supports the operations migrations need (DDL, advisory locks, prepared statements). Transaction Pooler remains the right choice for stateless serverless/edge runtime where per-statement connection acquisition matches Cloudflare's request lifecycle.

**Alternative considered and rejected:** Enabling Supabase's "IPv4 add-on" ($4/month). Cost is non-trivial relative to the free tier and the pooler-only approach is fully sufficient.

## D-019: Drizzle pooled client is Node-only; runtime queries on Cloudflare Pages use Supabase JS client

**Context:** Phase A initially specced `src/lib/db.ts` (Drizzle + postgres-js) as the runtime client for Server Component queries on Cloudflare Pages. Section 6 caught the conflict at build gate: `postgres-js` requires Node built-ins (`net`, `dns`, `tls`, `stream`) that the V8 isolate environment of Cloudflare Pages Functions does not provide. Build fails with `Module not found: Can't resolve 'net'` as soon as any `runtime = "edge"` route imports the Drizzle client.

The build gate did not catch this in Section 5 because webpack tree-shook the unused import — `src/lib/db.ts` existed but no route imported it, so the Edge-incompatible code never entered the bundle graph.

**Decision:** Runtime split:
- **Edge runtime** (Server Components, Server Actions, route handlers running on Cloudflare Pages Functions): use Supabase JS clients from `src/lib/supabase/{server,client,admin}.ts`. They use `fetch()` against PostgREST/GoTrue and run anywhere JavaScript runs.
- **Node runtime** (scripts, seed, Drizzle Kit migrations, anything running on the owner's local machine or a Node CI box): use the Drizzle pooled client from `src/lib/db.ts`.

Both clients connect to the same database. RLS applies to both. Choosing one over the other is a matter of where the code runs, not what query it performs.

**Why:** Honors the actual capabilities of each runtime. Avoids architectural impossibilities (no fetch-based Postgres driver exists for Supabase). Matches what ARCHITECTURE.md said at kickoff and what Phase A would have produced if I'd internalized it correctly.

**Operational consequence:** Drizzle's nicer typed-query API is unavailable in edge code. Supabase's TypeScript types (generated by `supabase gen types typescript`) provide the typing for `.from(...)` calls in edge code. The trade-off is one ergonomic API call site, not a structural problem.

## D-020: Design language — clean trust-forward (Option 1 / "Stripe-adjacent")

**Context:** After Phase A delivered a working but unstyled foundation, Phase A.5 required a design direction. Options reviewed: (1) clean/structured/trust-forward, (2) marketplace-classic Jiji-style, (3) editorial/boutique, (4) mobile-first native-app style.

**Decision:** Option 1 — clean, structured, trust-forward. Implementation details:
- Brand teal `#2D9D9F` reserved for logo accent, primary CTAs, key highlights, focus states
- Ink `#0B1220` for primary text
- Inter font, two weights (400/500) only
- Verified badge in sober green `#0F9D58`
- Card-based layouts, generous whitespace, mobile-first responsive
- Price is the typographic protagonist on every listing

**Why:** Aligns with the product's wedge ("real prices, verified sellers, one tap to chat"). Differentiates from existing Nigerian marketplaces (Jiji, Jumia) which use denser classified-ad aesthetics. Scales gracefully from cheap consumer goods to luxury items. Reads as "credible business" to first-time visitors.

**Locked elements:**
- Brand colors (teal + ink) — never change
- Typography family (Inter) — never change
- Verified badge color (#0F9D58) — never change

**Iterable elements:**
- Spacing scale, exact font sizes, card paddings — tunable as we learn from user feedback
- Specific imagery, page composition — tunable per phase

## D-021: Tailwind tokens vs inline values

**Decision:** All design values live in `tailwind.config.ts`. No inline hex codes, no magic spacing numbers in component markup. Components use Tailwind utility classes only.

**Why:** When (not if) we tune the design, we change one token file, not 200 component files. Phase A's "phantom column" lesson applies broadly: single source of truth saves debugging hours later.

## D-022: Email + password only at v2 launch; phone OTP and Google OAuth deferred

**Context:** Phase B implements user authentication. Multiple options considered: email + password, phone OTP (Supabase supports this with SMS provider configuration), Google OAuth, social providers generally.

**Decision:** Email + password only at launch. Phone is captured as a profile field (`whatsapp_number`) but is not an authentication factor.

**Why:**
- Phone OTP requires SMS provider setup (Twilio or similar) and per-SMS costs. Real money for unproven onboarding flow.
- Google OAuth adds a provider integration and consent flow that's not strictly necessary for v2 validation.
- Email + password is universal, free, and well-understood by users.
- Phone is captured for the seller-buyer WhatsApp flow (the actual product value), not for auth.

**Revisit when:** sign-up conversion is below target and we suspect email friction is the cause, or when Nigerian users disproportionately struggle with the email flow. Either signal is a reason to add phone OTP. Until then, the simpler stack wins.

## D-023: Email confirmation ON (revised 2026-05-15)

**Context:** Supabase's email auth has a toggle: "Confirm email" (require email-click before sign-in works) on/off. The initial Phase B decision was OFF — see superseded body below for original rationale. During Phase C.5 smoke testing the actual Supabase configuration was found to be ON, and the owner confirmed it should stay ON. This entry is updated in place rather than superseded because the rationale shifted with verified facts (the original "OFF" was never the live configuration).

**Decision:** Email confirmation is ON. Users must confirm their email via Supabase's confirmation link before establishing a session. Post-signup flow lands on `/sign-up/success` confirmation page; clicking the email link routes through `/auth/callback`.

**Why:**
- Confirmed email is the cheapest credible signal that a signup isn't a bot or typo. Spam signups (K-003) become much harder.
- The trust gate that matters most is still seller verification (Phase C.5's hard gate, D-032), but email-confirm is a useful first filter at zero ongoing cost.
- A confirmed email gives a working channel for password-reset (D-026), Pro-tier billing receipts (Phase G), and verification approval/rejection notices (deferred).

**Operational consequence:**
- `signUp` returns `user` but NO session. Any RLS-protected write in the signup action would fail (auth.uid() is NULL).
- Seller-specific data (business_name, business_state_id) is stashed in `raw_user_meta_data` and consumed by `/auth/callback` after token exchange — that's the first moment a session exists for the new user.
- `signUpAction` redirects to `/sign-up/success?type=<buyer|seller>&email=<encoded>` rather than to `/dashboard` or `/sell/verify` directly.
- The `handle_new_user` trigger still fires on `auth.users` INSERT (which happens during signUp regardless of confirmation state) and populates the profile from metadata, so the profile row exists even before email confirmation. The trigger does not depend on the session.

**Original Phase B rationale (superseded by verified configuration):** Phase B's decision body recorded OFF on the theory that onboarding friction kills marketplaces. That theory still has merit, but Supabase was never actually configured OFF — confirming with the owner during Phase C.5 closed the gap. If signup conversion drops noticeably, revisit by measuring email-confirm completion rate; we can flip back to OFF if the friction is the bottleneck.

## D-024: Server Actions for auth forms (no separate API routes)

**Decision:** All auth forms (`sign-up`, `sign-in`, `forgot-password`, `sign-out`) submit to Next.js Server Actions, not to API route handlers.

**Why:**
- Native to App Router. Less code, less plumbing.
- Form submission, error state, and pending state are first-class via `useFormState` and `useFormStatus`.
- Server Actions run on the edge (same runtime as the rest of the app).
- API routes are still available if a future feature genuinely needs an HTTP endpoint (e.g. webhooks from Paystack — Phase G).

**Trade-off:** Server Actions are progressive-enhancement friendly but tied to Next.js. We accept the framework lock-in — we're not portable to other React frameworks anyway, given the Cloudflare Pages + Next.js + edge runtime stack.

## D-025: All routes must export edge runtime — explicit not-found.tsx required

**Context:** Phase B's Cloudflare Pages deploy failed because the auto-generated Next.js `/_not-found` route doesn't have `export const runtime = "edge"`. Cloudflare's `@cloudflare/next-on-pages` adapter requires every non-static route to be edge-compatible.

Local `pnpm build` did not catch this — Next.js's own build doesn't enforce the requirement. Only Cloudflare's adapter does, at deploy time. The Phase A "build gate is optimistic about not-yet-wired Edge incompatibilities" lesson applies here in a new way: the build gate is also optimistic about routes Next.js auto-generates that we never explicitly authored.

**Decision:** All "system" Next.js pages we may rely on (404, 500, error) must be authored explicitly with `export const runtime = "edge"`. This includes:
- `src/app/not-found.tsx` — 404 (added in this fix)
- `src/app/error.tsx` — runtime errors (add when needed; currently no explicit auth flow requires it)
- `src/app/global-error.tsx` — unrecoverable root errors (add when needed)

**Operational consequence:** every new system page added in the future needs the edge runtime export. Adding it to AGENT.md's pre-flight checklist for new pages would prevent re-runs of this bug.

## D-026: Password reset UI lives at `/reset-password`; callback routes recovery flows there

**Context:** Phase B shipped the password reset email flow but landed users on `/dashboard` after clicking the recovery link, without a UI to actually set a new password. Phase B.7 closes that loop.

**Decision:**
- The auth callback (`src/app/auth/callback/route.ts`) inspects the `type` query parameter. If `type=recovery`, redirects to `/reset-password` instead of `/dashboard` or `next`.
- `/reset-password` is an authenticated route — it relies on the recovery code exchange having created an active session. The page renders a form that calls `supabase.auth.updateUser({ password })`.
- After successful password update, redirect to `/dashboard?toast=password-updated`.
- Middleware protects `/reset-password` — unauthenticated requests redirect to `/sign-in?error=reset-no-session`.

**Why two layers of protection (middleware + page-level guard):** middleware catches the common case; page-level `getUser()` is defense-in-depth in case the matcher ever drifts. Same pattern as `/dashboard`.

**What about expired recovery codes?** Supabase's `verifyOtp` (or `exchangeCodeForSession`) returns an error if the token is expired. The callback handler returns to `/sign-in?error=callback-failed`. The user can then request a new reset link.

## D-027: Auth callback handles both `token_hash` and `code` flows

**Context:** During Phase B.7 testing, the password reset email link arrived as `https://<site>/#access_token=...` (Supabase implicit/hash flow) rather than `?code=...` (PKCE/code flow). Our callback handler at `src/app/auth/callback/route.ts` only handled `code`, so recovery clicks fell through to the error path.

**Root cause:** The default Supabase email template uses `{{ .ConfirmationURL }}` which generates an implicit-flow hash URL pointing at Site URL root. Our callback handler is at `/auth/callback` and expects code-flow query parameters.

**Decision:**
1. **Updated the Supabase Reset Password email template** to use `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` instead of `{{ .ConfirmationURL }}`. This routes recovery emails through our callback handler with proper query parameters.
2. **Updated the callback handler** to support both `token_hash` (used by email links via `verifyOtp`) and `code` (used by OAuth and PKCE-style callbacks via `exchangeCodeForSession`). Both branches share the same post-success routing: `recovery` → `/reset-password`, else → `next` or `/dashboard`.

**Why both flows:** `token_hash` is what Supabase email templates with `{{ .TokenHash }}` generate, used for password recovery, signup confirmation, magic links, email change. `code` is used for OAuth providers and PKCE-style callbacks. Future phases may add either; the callback handles both without further changes.

**Operational consequence:** any future email template we customize in Supabase must use `{{ .TokenHash }}` (NOT `{{ .ConfirmationURL }}`) and point at `/auth/callback?token_hash=...&type=<type>&next=<path>`. Tracked in P.4 (added to AGENT.md pre-flight checklist for any phase that customizes templates).

## D-028: Toast primitive for transient success/info/warning messages

**Context:** Phase B.7 raised the question of how to confirm success after a password update. Inline banners-per-page would fragment the pattern; a shared primitive lets every future success/error moment compose the same component.

**Decision:** A `Toast` component in `src/components/ui/` with four variants (success/info/warning/danger). Auto-dismiss after 5 seconds by default; persistent if `durationMs={0}`. Manual dismiss via X button.

Server-driven success states (like password updated after a Server Action) signal toasts via a `?toast=<key>` query parameter on the redirect URL. The receiving page reads the key, resolves it through a lookup table in `src/lib/toasts.ts`, and renders the matching toast.

**Why a lookup table, not raw text in URL:**
- Prevents arbitrary text injection through query strings
- Keeps message content server-side where it can be reviewed
- Future internationalization plugs into the lookup, not into hundreds of redirect call sites

**Operational consequence:** future flows that need toast confirmations add an entry to `toastMessages` in `src/lib/toasts.ts` and redirect with `?toast=<new-key>`. The Toast component itself doesn't need changes.

## D-029: Phase C scope — paste-URL images at launch, real upload in Phase C.5

**Context:** Phase C builds the marketplace core (seller listing CRUD, buyer browse, detail page). Real image upload via Supabase Storage was considered for inclusion but deferred to Phase C.5.

**Decision:** Phase C uses paste-an-image-URL inputs. Sellers paste public image URLs (e.g. from Unsplash, their own hosting, or a temporary CDN). URLs are validated as http(s) and stored verbatim in `product_images.url`.

**Why deferred:**
- Real image upload requires Supabase Storage bucket setup, multi-file upload UI, progress states, image optimization, deletion on listing removal — a substantial parallel track of work
- Bundling it with the marketplace CRUD work risks Phase C ballooning past the point of recovery if anything goes wrong mid-phase
- Paste-URL lets the design and flow be tested end-to-end with realistic images from day one
- Phase C.5 follows immediately with: real image upload, keyword search, filters, verified-badge gating

**Operational consequence:** sellers test by pasting Unsplash URLs or similar. Production users at launch will use the same paste-URL approach until Phase C.5 ships. Acceptable for v2 validation; not acceptable for general launch (Phase J).

## D-030: Verified badge displayed by `verification_status='verified'` flag, not by seller existence

**Context:** Phase C surfaces verified badges across the marketplace (listing cards, listing detail page). The badge displays only when the seller's business has `verification_status='verified'`.

**Decision:** Phase C shows the badge conditionally. Since no seller verification flow exists yet (Phase D), the badge will only appear if an admin manually flips `verification_status` to `'verified'` via Supabase Dashboard. This is fine for Phase C — testing the visual is straightforward.

**Why:** The badge is the trust gate. Showing it indiscriminately would defeat its purpose. Showing it correctly now (even though Phase C.5 will refine the display rules) ensures Phase D's verification flow plugs into existing UI without changes.

**Operational consequence:** during Phase C testing the owner manually flips a test seller's `verification_status` in SQL Editor to confirm the badge appears. Phase D builds the real flow.

## D-031: Phase C.5 pivoted to seller verification gate; image upload / search / filters deferred to Phase E

**Context:** Phase C shipped a working marketplace with `verification_status='pending'` stored but not enforced. Pending sellers' listings were visible to buyers identically to verified sellers' listings (except for the badge). This contradicts ShowMePrice's product wedge ("Real prices, verified sellers") and exposes the platform to Nigerian C2C marketplace fraud patterns the model is supposed to solve.

**Research summary (Nigerian C2C/B2C marketplaces):**
- **Jumia / Konga** (high-trust, hold money via integrated pay): require NIN or CAC + government ID + bank verification + photo holding ID. Verification before listing. 24-72 hour review.
- **Jiji** (closest to our C2C model, no money custody): basic posting is open; "Verified ID" badge is optional, requires ID + selfie via SmileID, gated by paid Boost package. Result: many unverified ads, persistent scam reputation.
- **ShowMePrice's position:** we do not hold money (contact-reveal model), but we do promise verified sellers. Going Jiji-light defeats the wedge; going Jumia-heavy is overkill since we're not a payment processor.

**Decision:** Phase C.5 builds a seller verification flow that GATES public listing visibility. Specifically:
- Sellers can create listings (mechanics from Phase C remain unchanged in the database)
- Listings from sellers with `verification_status != 'verified'` are HIDDEN from public marketplace, category pages, home featured, and search results
- Sellers see their own draft listings in `/dashboard/listings` regardless of verification status (so they can prepare while waiting)
- Verification submission collects: full legal name (first + last), residential address, NIN (11-digit National Identification Number), government ID document upload, selfie photo
- Admin (the owner) manually reviews submissions via `/admin/verifications` and approves or rejects with a reason
- Once approved, all the seller's existing draft listings become public automatically

**What this displaces:**
- Image upload via Supabase Storage → **Phase E**
- Keyword search (Postgres tsvector) → **Phase E**
- Filters (price range, sort) → **Phase E**
- `/categories` index page (K-007 fix) → **Phase E**
- Verified-badge refinement → folded into Phase C.5 (the gate makes refinement trivial — verified means publicly visible)

**Why manual review for now, not third-party API:**
- Low volume initially; manual is cheap
- Third-party APIs (SmileID, Dojah, Verifyme.ng) cost per-check and aren't perfect — automation comes when we see what real fraud looks like
- The first 50-100 reviews are product research the admin needs to do personally to learn rejection patterns
- Automated NIN/ID verification API tracked for Phase E or later

**Compliance posture:**
- NIN is mandatory for all Nigerian adults; collecting it is standard
- We are NOT a financial institution under CBN; BVN is not required
- NDPR (Nigeria Data Protection Regulation, 2019) applies to personal data handling — Phase C.5 spec will include data-minimization, encryption-at-rest, access controls, and a defined retention policy
- Documents (ID + selfie) stored in Supabase Storage with RLS — only the uploading seller and admins can access

**Open question (deferred to Phase C.5 planning):** whether to collect BVN as well for sellers using Pro tier (Phase G — Paystack subscriptions). Paystack may require BVN/bank verification for payout; if so, the Pro upgrade flow collects it then, not at initial verification.

## D-032: Verification gate is a HARD gate, not a badge

**Context:** Two models considered for unverified seller visibility:
1. **Hard gate** — unverified listings hidden entirely (D-032)
2. **Soft gate** — unverified listings visible with a clear "unverified" badge

The soft gate model resembles Jiji's; the hard gate resembles a stricter version of Jumia/Konga adapted to our non-custodial model.

**Decision:** hard gate. Unverified seller listings do not appear in any public-facing query. The verified badge becomes implicit (every visible seller is verified) rather than a feature to seek out.

**Reasoning:**
- Defends the "Real prices, verified sellers" product promise truthfully
- Eliminates the failure mode where buyers contact unverified sellers and get scammed, then blame the platform
- Differentiates from Jiji's perceived scam problem
- Friction for sellers is desirable filtering — bad actors abandon at verification rather than after harming buyers

**What sellers see during pending state:**
- Full `/dashboard/listings` access; can create / edit / delete draft listings
- Banner: "Complete verification to make your listings public"
- Clear CTA to verification flow
- Submission status: pending review / approved / rejected with reason
- On rejection, can resubmit with corrections

**What buyers see:** no indication that pending sellers exist. The marketplace simply shows verified sellers.

## D-035: Seller's verification submit action does NOT touch businesses.verification_status

**Context:** Phase A's `businesses_freeze_verification` trigger blocks non-admins from changing `businesses.verification_status`. Phase C.5's seller submission flow cannot directly UPDATE this column without bypassing the trigger.

**Decision:** The seller's `submitVerificationAction` only INSERTs into `seller_verifications`. It does NOT update `businesses.verification_status`. The seller's dashboard derives state from BOTH `businesses.verification_status` AND the latest `seller_verifications.status` row. The admin's approve/reject actions (running with admin role, passing the freeze trigger's `auth.uid()` check) update both tables.

**Why:** Preserves Phase A's security model. `businesses.verification_status` remains a column ONLY admins can modify, enforced at the trigger level. Sellers write to an audit table; admins consume from it and update canonical state.

**State derivation:** see `src/lib/verification.ts:getVerificationState()`. Helper returns one of: `no_business | unsubmitted | pending | rejected | verified` based on the combined signals. Used in `/dashboard`, `/dashboard/listings`, `/sell`, `/listings/new`.

## D-040: Signup overhaul — buyer/seller toggle on /sign-up

**Context:** Phase B's signup created only buyer accounts; sellers had to sign up then visit `/sell` separately. Two-step flow added friction for users with seller intent.

**Decision:** `/sign-up` has a buyer/seller toggle. Selecting seller reveals business name + state fields. Seller signup creates profile + business row, sends confirmation email. After email confirmation, `/auth/callback` creates the seller's business row (idempotent), then routes seller to `/sell/verify` or buyer to `/dashboard`. `/sell` becomes hybrid: shows "become seller" UI for users who upgrade later, "manage business" UI for existing sellers.

**Why:** Removes a step in the seller conversion funnel. Captures seller intent at the highest-motivation moment. Preserves the buyer-upgrades-to-seller path for users who join as buyers first.

**Operational:** `handle_new_user` trigger populates profiles from `auth.users.raw_user_meta_data` (`display_name`, `whatsapp_number` only — NOT `user_type`). Application code does post-signup UPDATE for `user_type='seller'`. With email confirmation ON (D-023), business INSERT happens in `/auth/callback` (post-token-exchange, real session), not in the signup action (no session available pre-confirmation).

## D-041: /listings/new blocks unverified sellers

**Context:** Sellers create listings. Listings need `status='active'` AND `business.verification_status='verified'` to appear publicly (RLS policy `products_public_read_active`). If sellers can create active listings before verification, they accumulate hidden listings.

**Decision:** `/listings/new` shows a verification gate page when seller's business is not verified. `createListingAction` also gates server-side as defense in depth. Gate copy varies by state (unsubmitted/pending/rejected) with appropriate CTAs.

**Alternative considered:** allow draft creation with `status='draft'` for pre-verified sellers, auto-publish on approval. Deferred — adds complexity without proportional value at v2 launch.

## D-042: Categories taxonomy structure — three-tier system

**Context:** Phase D needed a category taxonomy that matched how Nigerian buyers actually shop. Initial Phase A seeds were placeholder generic categories. D-042 codifies the rebuild around Jiji/Jumia volume patterns and dedicated retailer conventions.

**Decision:** Three-tier system surfaced through `categories.tier` (integer, NOT NULL DEFAULT 3):
- **Tier 1 (6 featured parents):** home page priority cards. Fashion & Apparel, Mobile Phones & Tablets, Hair & Wigs, Beauty & Personal Care, Electronics & Gadgets, Home & Furniture.
- **Tier 2 (11 standard parents):** visible in `/categories` index but not on home grid. Health & Wellness, Baby & Kids, Foodstuff & Groceries, Automotive, Property, Sports & Fitness, Computer & Accessories, Travel & Luggage, Drinks & Beverages, Perfume & Fragrance, Building Materials & Supplies.
- **Tier 3 (11 disclosed parents):** behind an "Other categories" `<details>` disclosure on the categories index. Services, Books & Media, Pets, Industrial & Business, Office Supplies, Tools & Hardware, Garden & Outdoor, Musical Instruments, Arts & Crafts, Photography Equipment, Religious Items.

**Why:** Tier choice driven by Nigerian e-commerce volume signals (Jiji listing counts, dedicated retailer presence) and the home page's discovery budget (one screen-height of cards, ~6 entries before density degrades).

**Subcategory inheritance:** subcategories don't carry a meaningful `tier` value — they're displayed alongside their parent. Default 3 keeps the column NOT NULL without semantic weight at the sub level.

## D-043: Featured states with dynamic city chips

**Context:** Home page needs a discovery affordance for the most-trafficked states. Hardcoded ordering risked feeling stale; pure-listing-count ordering risked an empty row at launch.

**Decision:** 9 featured states ranked by `FEATURED_STATE_SLUGS` (Lagos, Abuja, Rivers, Delta, Oyo, Enugu, Kaduna, Anambra, Kano). Home Hero chips render dynamically by verified-active listing count via `getFeaturedCityChips()` in `src/lib/states.ts`; hardcoded order pads when fewer than 9 states have listings.

**City labels:** chip display name overrides the state name where the commerce-recognized city differs:
- Rivers → "Port Harcourt"
- Delta → "Warri" (over Asaba — better-known commerce hub)
- Oyo → "Ibadan"
- Anambra → "Onitsha" (over Awka — commerce centre)

Map lives in `STATE_CITY_LABELS` (`src/lib/states.ts`). State dropdown elsewhere keeps the canonical state names — chip labels are buyer-facing only.

## D-044: Hard-delete listings with confirmation page

**Context:** Sellers can delete their listings. Inline confirmation modals would mix destructive actions with the listings grid; dedicated confirmation pages are the C.5 pattern for irreversible actions (verification submission, signup, admin approval).

**Decision:** `/listings/[id]/delete` renders a dedicated server-component confirmation page (title + primary image + image count + Cancel/Confirm). Submit POSTs to `deleteListingAction` which removes Storage objects then DB-deletes the product (product_images cascade via FK ON DELETE CASCADE). Hard-delete — no soft-delete column. Pattern from Phase C.5's "critical actions deserve dedicated confirmation pages" lesson.

## D-045: JSONB category_specs for per-category dynamic fields

**Context:** Different categories need different listing fields (phones need Condition; vehicles need Year + Mileage; fashion needs Size + Color; property needs type/bedrooms/bathrooms). Static columns on `products` for every possible field would balloon the schema; new fields would need migrations.

**Decision:** Add `products.category_specs jsonb` (nullable). Schema-in-code (`src/lib/categorySpecs.ts`) defines per-category field sets; application validates submitted values against the schema before INSERT/UPDATE. Subcategories inherit parent's schema via `getSpecsForCategory(slug, parentSlug)` fallback.

**Trade-off:** DB doesn't enforce shape — application is authoritative. Right call when shape is evolving rapidly. Future Phase J reputation/reviews might warrant promoting frequently-queried specs to columns; the JSONB stays as a flexible overflow.

## D-046: Foodstuff / Drinks split and Nigerian taxonomy alignment

**Context:** Phase D's initial taxonomy had a single "Food & Drinks" Tier 2 parent. Research (Olubrooklyn Foods, AgroHandlers, SundryAgro, Bodija/Balogun markets) showed "foodstuff" is the canonical Nigerian retail term for groceries, and that drinks operate as a separate vertical with clear alcoholic/non-alcoholic split.

**Decision:** Phase D.7.4 deleted `food-beverages` (count check confirmed 0 listings) and replaced with two Tier 2 parents:
- **Foodstuff & Groceries** (10 subs): Grains & Rice, Spices & Seasonings, Cooking Oils, Beans & Legumes, Tubers & Flour, Fresh Produce, Frozen Foods, Packaged & Bakery, Snacks & Confectionery, Baby Food.
- **Drinks & Beverages** (7 subs): Alcohol & Spirits, Wine, Beer, Soft Drinks, Juices, Water, Coffee & Tea.

**Why:** matches Nigerian retail vocabulary. Buyers searching "foodstuff" arrive at the right category by name; "drinks" gets dedicated wine/beer/spirits sub-navigation.

## D-047: Perfume promoted to Tier 2

**Context:** Initial taxonomy buried perfume under Beauty. Research showed Perfume operates as a standalone vertical in Nigerian e-commerce — Jiji has Fragrance as top-level, Jumia at `/fragrances/`, dedicated retailers (Fragrances.com.ng, The Scents Store).

**Decision:** Phase D.7.5 promoted `perfume-fragrance` to Tier 2 (sort_order 16) with 8 subcategories: Men's, Women's, Unisex, Arabian/Oud, Body Sprays, Perfume Oils, Deodorants & Antiperspirants, Car Perfumes & Fresheners.

**Side effect:** Beauty aliases narrowed — `perfume`, `fragrance`, `cologne` dropped from Beauty's `search_aliases` so the queries route to the new dedicated category. Beauty's replacement aliases lean into product-type vocabulary (lipstick, mascara, foundation, soap, body wash).

## D-048: Building Materials added to Tier 2

**Context:** Jiji.ng has 52,165+ active building-materials listings nationwide (Abuja alone has 3,000+). Major Nigerian brands (Dangote Cement, Lafarge, Berger Paints, Sadolin, Nigerite, West African Ceramics) dominate the local market.

**Decision:** Phase D.7.6 added `building-materials` Tier 2 (sort_order 17) with 10 subcategories: Cement & Concrete, Tiles, Roofing Materials, Doors & Windows, Blocks Bricks & Stones, Iron Steel & Rods, Plumbing & Sanitary, Electrical & Wiring, Paint & Finishing, Ceiling & Interior. 63-entry search_aliases including Nigerian-specific terms (`pop` for plaster-of-paris ceiling, `3d panel`).

## D-049: Search alias-purity rule

**Context:** Phase D.7.2 added a `categories.search_aliases jsonb` column to support synonym-based search (Nigerian terminology like "tokunbo", "fairly used", "fashion"). The implementation resolves matching categories first, then includes all subcategory listings via `category_id IN (...)`. D.7.3 expanded aliases to include brand and model names (Toyota, iPhone, MacBook); D.7.3 smoke testing surfaced that "toyota" returned every Cars-subcategory listing — way over-broad.

**Decision:** `search_aliases` holds category-level synonyms only. Brand and model names never go in aliases — those match via `title.ilike.%q%` and `description.ilike.%q%` against real listing text in the same `.or()` clause. A term goes in `search_aliases` only when it describes the category itself ("rice", "spice", "wine", "beer", "perfume", "fragrance"), never when it identifies a specific maker ("Maggi", "Coke", "Toyota", "iPhone").

**Why:** aliases trigger subcategory expansion (the whole point of the alias system). Brand-term aliases would silently broaden every brand-name search to all listings in the category, masking the brand-specific matches the buyer actually wanted.

## D-050: Alias-purity refinement (the oud test)

**Context:** D.7.5 needed to add aliases for Perfume & Fragrance. "Oud", "agarwood", "oriental", "arabian oud" sit in an ambiguous zone — they originated as descriptors of specific perfume types but are now used by Nigerian buyers as scent-category descriptions (e.g., "I want an oud perfume" doesn't mean a specific brand).

**Decision:** brand-derived terms can be aliases IF their primary Nigerian usage is category-descriptive rather than brand-identification. The test: **does the term primarily describe the category, or identify the maker?**
- "Oud" describes a scent type across many brands → in.
- "Maggi" refers to a specific seasoning brand → out.

**Why:** D-049's binary rule (no brand terms ever) would have excluded oud, but oud functions as a scent-type category in Nigerian buyer vocabulary. The refinement keeps the architectural intent (no over-broad expansion) while honouring real usage patterns.

**Operational:** when in doubt, exclude. Better to miss a borderline alias and fix later than to pollute the alias set with brand crossovers that re-introduce the over-broad-expansion bug.

## D-051: Mobile search overlay pattern

**Context:** Phase D.5 added a global header search bar visible at `md+` breakpoints. Phase D.5.1 hid the input below `md` (to make room for navigation). Phase D.7.3 smoke testing revealed mobile users had no search affordance at all.

**Decision:** mobile (<md) shows a magnifying-glass icon button in the header. Tap opens a fixed-position overlay anchored to the top with the search input pre-focused. ESC, backdrop click, or dedicated X button all dismiss. Desktop (≥md) keeps the inline form unchanged. State lives in `src/components/layout/HeaderSearch.tsx` (client component); the rest of the header stays server-rendered.

**Why:** the search input is a primary affordance on a marketplace; an icon-overlay is the e-commerce convention for mobile (Amazon, eBay, Jiji all use it). Keeping the open/close state inside a focused client component preserves server-side rendering for the surrounding header.

## D-052: Dynamic feature lists with hardcoded fallback

**Context:** Several Phase D features ranked entries by user-data (e.g., home page city chips ordered by listing count). At launch, listing volume is sparse — a pure-data-driven ranking would produce a near-empty UI.

**Decision:** pattern for affordances driven by user data that may be sparse early — query top N entries by some real-data metric (listing count, search frequency, etc.); pad with a hardcoded fallback order if fewer than N entries have data. Implemented in `getFeaturedCityChips()` (`src/lib/states.ts`): top 9 states by verified-active listing count, padded with `FEATURED_STATE_SLUGS` order when listings are sparse.

**Why:** never let "we don't have data yet" produce a broken-looking UI. Pad first, evolve to pure-data as volume grows. The hardcoded fallback is editorial; the data ordering is editorial-with-evidence.

## D-053: Tier 2 density ceiling at 11

**Context:** Phase D ended with Tier 2 at 11 categories (started at 4 in D.4.1). Each addition was justified by Nigerian buyer-demand data, but the home page's "Browse by category" and `/categories` index grids approach visual density limits around 10-12 entries.

**Decision:** hard ceiling at 11 Tier 2 categories. Future Tier 2 additions need to clear two gates:
1. Nigerian buyer-demand data justifies standalone status (Jiji listing volume, dedicated retailer presence, search frequency).
2. The category doesn't fit cleanly as a subcategory of an existing Tier 2 parent.

**Operational:** if both gates pass, *also* propose demoting a current Tier 2 to Tier 3 to keep the count at 11. The ceiling forces explicit trade-offs rather than accumulating until the UI breaks.

## D-054: Email confirmation uses token_hash flow (resolves K-011)

**Context:** K-011 documented a real-world buyer-impact bug: cross-browser email confirmation fails because `@supabase/ssr` defaults to the PKCE flow. The Supabase client stores a `code_verifier` cookie in Browser A at signUp time; Browser B has no verifier when the user clicks the email link, so `exchangeCodeForSession()` fails and the user lands on `/sign-in?error=callback-failed`. Real Nigerian users frequently sign up on laptop and click email on phone.

**Decision:** the email confirmation flow uses Supabase's `token_hash` mechanism (stateless OTP verification under the hood) rather than PKCE. Mirrors the D-027 password-reset pattern. Two pieces:

1. **Supabase Dashboard → Authentication → Email Templates → "Confirm signup"**: change the URL in the template body from `{{ .ConfirmationURL }}` (PKCE-coupled `?code=...` form) to:
   ```
   {{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/dashboard
   ```

2. **`/auth/callback/route.ts`**: no code change needed — the `token_hash + type` branch already handles every email-link type via `supabase.auth.verifyOtp({ token_hash, type })` (D-027 work made this type-agnostic).

PKCE remains available for OAuth-style flows when those land in Phase F+ (Google, Facebook sign-in). The token_hash path is specifically for email-link flows where same-browser cookie continuity isn't safe to assume.

**Why this works cross-browser:** `verifyOtp` exchanges the server-side token_hash against Supabase's records — no client-side state required. Browser B can verify a Browser A token because Supabase, not the browser, owns the verification material.

**Trade-off accepted:** token_hash is slightly less protected against email-interception attacks than PKCE (since an intercepted link is sufficient to verify, vs PKCE which requires the originating browser's cookie). The trade is correct for ShowMePrice — Nigerian buyers' cross-device email habit is a stronger reality than email-interception attack scenarios at v2 scale.

**Operational:** the Dashboard change is owner-applied. No code deploys gated by this fix. Once the template is updated, K-011 is closed; smoke test by signing up in one browser and clicking the confirmation link in a different browser (or different incognito window).

## D-055: Phase E schema-collision resolutions (ALTER-in-place over DROP-and-recreate)

**Context:** the Phase E spec defines four tables/columns that collide with existing Phase A/C.5/D schema. The collisions weren't drift in spec writing — they were the spec adopting names/shapes that align with the broader Phase E vocabulary (e.g., `phone` over `whatsapp_number`) while the existing schema reflects earlier Phase A conventions.

**Decision:** four resolutions, all favouring **ALTER in place** over DROP-and-recreate so existing FK constraint names and audit history are preserved.

1. **`subscriptions`** (Phase A placeholder vs Phase E lifecycle):
   ALTER in place. Rename `profile_id → user_id`, add ten lifecycle columns (`payment_provider`, `provider_subscription_code`, `plan_code`, `started_at`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `cancelled_at`, `payment_method`, `created_at`). Existing FK constraint `subscriptions_profile_id_profiles_id_fk` will need renaming or replacing as part of the ALTER — handled in E.1.1.

2. **`contact_reveals`** (Phase A vs Phase E):
   ALTER in place. Rename `product_id → listing_id`, add `credit_used` + `payment_id` + `revealed_at`, drop `channel` and `ip_hash` (Phase E spec doesn't use them; Phase H+ analytics can re-add via a separate audit table if needed).

3. **`profiles.whatsapp_number → phone`**:
   Column rename. Single source of truth — the column already held E.164-no-plus phone numbers; the name now matches Phase E's vocabulary throughout the app. Unique constraint added to enforce one-account-per-phone at the DB layer.

4. **`states` (spec text) vs `nigerian_states` (actual table)**:
   Use the actual name. Spec was drift on the writer's side; no code path references `states`.

**Rationale for the consistent ALTER-in-place choice:** existing rows have no production data (test accounts only), but the existing FK constraint names live on across other tables. DROP-and-recreate would force cascading constraint renames; ALTER preserves them. Trade-off is moot at v2 scale where retention is "zero real users yet"; the discipline matters for future migrations on tables that DO carry production data.

**Operational:** the `handle_new_user` trigger function (Phase A) INSERTs into `profiles.whatsapp_number`. After the column rename, the trigger fails. Owner SQL update needed in conjunction with the E.1.0 application code rename — without it, every new signup throws a column-not-found error.

## D-056: Phase E phone OTP — Path A (Supabase Send SMS Hook + Termii) pending validations

**Context:** Phase E §4 requires phone-OTP signup via Termii. Two paths considered: (A) Supabase Auth's `signInWithOtp({ phone })` with Termii wired as a custom SMS provider via Supabase's Send SMS Hook, (B) bypass Supabase Auth's phone flow entirely and roll a custom OTP table.

**Decision:** Path A, pending two validations the owner must complete before Stage 2 implementation begins.

**Rationale:** Path B duplicates ~150 LOC that Supabase Auth already battle-tests (OTP hashing, replay prevention, attempt counting, expiry, resend rate-limit). Path A keeps `auth.users` as the single user-record source of truth, sessions/JWT/RLS work transparently, and the synthetic-email trap of Path B is avoided. Supabase Send SMS Hook is GA (post-2024), not beta, and the payload contract is stable.

**Validations required before Stage 2 lock-in:**

1. **Termii API latency p95 < 4s** measured from a Cloudflare Pages Edge route. Supabase's Send SMS Hook has a hard **5-second timeout**; if Termii's response under load exceeds 4s, the hook fails and signup throws. Mitigation if validation fails: move the hook to a non-edge runtime, OR fall back to Path B with our own queue + retry semantics.

2. **Sender ID "ShowMePrice" whitelisted on DND/transactional route across MTN, Glo, Airtel, 9mobile.** Termii sender ID approval is 1–5 business days on MTN/Airtel; Glo and 9mobile frequently reject custom alphanumeric IDs and substitute `INFINITI` or a numeric shortcode. Until "ShowMePrice" is whitelisted on all four, Stage 2 ships against Termii's pre-approved `SecureOTP` sender ID — UX copy mustn't reference the displayed brand until approval lands.

**Cost note:** Supabase's hosted phone auth gates `signInWithOtp({ phone })` behind the **Pro plan ($25/mo)**. Must be provisioned before Stage 2. (Documented separately as D-062.)

## D-059: escrow_orders retained alongside Phase E orders + escrow_transactions

**Context:** Phase A created `escrow_orders` as a forward-looking table for buyer-paid-escrow workflows. Phase E spec §18 defines `orders` + `escrow_transactions` as separate empty-schema tables for the same use case. The two designs have overlapping but distinct shapes — `orders` tracks the lifecycle, `escrow_transactions` tracks the money custody.

**Decision:** keep `escrow_orders` as-is, add Phase E's `orders` and `escrow_transactions` alongside as empty tables. No data migration. Phase G+ (when the escrow flow actually ships) chooses one and migrates.

**Rationale:** none of the three tables are populated. Forcing a reconciliation now is premature when Phase G+ will revisit the design anyway. The conservative path is "keep all three table definitions, let Phase G+ pick the winner."

**Operational:** documented in `ACTUAL_SCHEMA.md` so future planners know the duplication is intentional, not drift.

## D-060: Termii fallback sender ID to SecureOTP during ShowMePrice approval window

**Context:** D-056's second validation depends on "ShowMePrice" sender ID approval across all four Nigerian carriers. The approval window is 1–7 business days; Glo and 9mobile sometimes reject custom alphanumeric IDs entirely.

**Decision:** Stage 2 buyer-auth ships against Termii's pre-approved `SecureOTP` sender ID, not "ShowMePrice." Switch to "ShowMePrice" only after the four-carrier whitelist is confirmed by Termii.

**Operational:** SMS template body must not say "from ShowMePrice" — it must use neutral copy like "Your code is {{otp}}. Valid for 10 minutes." The branding lives in the body content (mentions of ShowMePrice as the brand the OTP is for), not in the sender ID surface, until carrier whitelisting completes.

## D-061: Termii OTP transport via `/api/sms/otp/send`, not generic `/api/sms/send`

**Context:** Termii exposes two SMS endpoints. The generic `/api/sms/send` routes via Promotional/DND rails; MTN's 8pm–8am WAT promotional blackout silently drops OTP messages, and Promotional route drops to DND-enabled numbers (common on MTN). Termii's `/api/sms/otp/send` routes via DND/transactional rails by default, with built-in pin generation, attempt counting, and TTL.

**Decision:** use `/api/sms/otp/send` for all signup and verification OTP delivery. The generic endpoint is reserved for future Pro-tier SMS notifications (Phase E §9) where messages are non-time-critical and DND consent applies.

**Operational:** Termii's OTP endpoint handles pin generation server-side. When we wire it under Supabase's Send SMS Hook (D-056), we'll either (a) pass through Supabase's pre-generated code or (b) use Termii's pin generation and configure Supabase to accept the verification result. Path (a) is simpler; path (b) is more robust against network failures. Stage 2 picks during implementation.

## D-062: Supabase Pro plan required for Phase E phone auth

**Context:** Supabase hosted's `signInWithOtp({ phone })` feature is gated behind the **Pro plan ($25/mo)** regardless of which SMS provider sends the message (Twilio, Vonage, custom via Send SMS Hook).

**Decision:** owner provisions Supabase Pro plan before Stage 2 ships. Cost is a fixed monthly line item.

**Operational:** the Pro plan also unlocks: Send SMS Hook (custom SMS provider), Send Email Hook (custom email provider for future Phase F+ template control), MFA Phone hook, and increased database/storage limits. Phase E's Termii integration depends on the Send SMS Hook specifically.

## D-063: 60-second resend lockout + "still on the way" UX for Nigerian SMS latency

**Context:** Nigerian carrier SMS delivery latency regularly hits 30 seconds to 5 minutes, especially MTN under peak load. A signup UX that locks the user out after 1 OTP attempt or 30-second resend window will produce abandonment.

**Decision:** Stage 2 OTP UX:
- Resend button disabled for 60 seconds after first send.
- Copy: "Code on the way. Didn't get it? Resend in 60s."
- After resend available, allow 3 resends per phone per hour (Termii rate limit gives headroom).
- On 3rd failed verification attempt, force a fresh OTP request (not just retry the same code).

**Operational:** Supabase's Send SMS Hook + `verifyOtp` already implement attempt counting and resend rate limits server-side. The UX layer just needs to surface the right copy and disable controls during the lockout window.

## D-064: Phone OTP costs budgeted at ~3× successful signups

**Context:** Termii SMS cost on DND/transactional route is ~NGN 2.50–4 per send. Typos, resends, undelivered (carrier outages), and abandonment mean total OTP sends per successful signup average ~3×.

**Decision:** Phase E launch budget assumes ~3 SMS attempts per successful buyer signup. At a planning target of 1,000 buyer signups/month, that's ~3,000 SMS attempts ≈ NGN 7,500–12,000/month before Pro-tier SMS notifications. Pro-tier SMS adds variable cost per Pro subscriber (max 5 SMS/buyer/day per D-spec §9).

**Operational:** monthly Termii spend tracked as a Phase E launch KPI. If actual ratio exceeds 5× attempts/signup, investigate carrier delivery quality or sender-ID approval status before increasing budget.

## D-065: Glo + 9mobile sender ID fragility — copy must not depend on displayed brand

**Context:** Termii's sender ID approval is reliable on MTN and Airtel but inconsistent on Glo and 9mobile. Even after approval, Glo or 9mobile sometimes substitute the displayed brand with `INFINITI` or a numeric shortcode. Users on those carriers may see OTPs arrive from an unfamiliar sender.

**Decision:** SMS body copy must self-identify the brand. Don't write "Your ShowMePrice code is {{otp}}" assuming the sender ID will say "ShowMePrice" — write the body so the recipient knows it's from us regardless of the rendered sender ID. Example: "ShowMePrice.ng: your verification code is {{otp}}. Valid for 10 minutes. Never share."

**Operational:** the body-includes-brand convention is cheap insurance against carrier substitution. Also helps if we ever switch SMS providers — body identity stays stable; sender ID is a moving part.

---

## D-069: Post-rename index hygiene — orphaned index names survive column renames

**Context:** During E.1.1, `subscriptions.profile_id` was renamed to `user_id`. Postgres correctly auto-updated the index's column reference (the index `subscriptions_profile_idx` still functioned as a btree on `user_id`), but the index name itself didn't change. After E.1.1's own `CREATE INDEX subscriptions_user_idx ON subscriptions(user_id)` ran, the table ended up with two functionally identical indexes — one with a misleading post-rename name.

**Decision:** Whenever a column is renamed, scan `pg_indexes` for any index name containing the old column name and either rename or drop it. Don't trust that an index is gone just because its column reference rotated — the name is independent metadata.

**Diagnostic pattern:**
```sql
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname ILIKE '%<old_column_name>%';
```

**Operational:** E.1.2 dropped `subscriptions_profile_idx` as cleanup. Bank this query alongside the pg_proc scan (MEMORY.md Phase E.1.0.1) — both are now standing pre-flight steps for any column rename.

---

## D-070: `reports` 7-day rate limit enforced in application layer, not schema

**Context:** PHASE_E_SPEC.md §13 proposed enforcing the "1 report per reporter per target per 7 days" rule via a partial unique index: `WHERE created_at > NOW() - INTERVAL '7 days'`. Postgres rejects this — `NOW()` is not IMMUTABLE and cannot appear in a partial index predicate.

**Decision:** Drop schema-level enforcement of the rate limit. The server action that creates a report performs a SELECT for prior reports by the same reporter against the same `(target_type, target_id)` within the last 7 days and rejects with a user-facing rate-limit error. The composite index `reports_reporter_target_idx ON reports(reporter_id, target_type, target_id, created_at)` makes that lookup cheap.

**Trade-off:** application-level enforcement allows races (two concurrent report submissions could both pass the check). Acceptable for moderation — a duplicate report is low-cost noise, not a correctness issue, and admins dedupe in the review queue.

**Operational:** the rate-limit check belongs in the report-creation server action, not in any RLS policy (RLS can't reference `NOW() - INTERVAL` for the same immutability reason).

---

## D-071: `price_history.changed_by` attributed via `NEW.seller_id`, not auth.uid()

**Context:** E.1.2 added an AFTER UPDATE OF price_kobo trigger on `products` that writes to `price_history`. Triggers can't reliably resolve the request's `auth.uid()` without parsing `current_setting('request.jwt.claims', true)` — which works under PostgREST but is brittle under direct DB connections, edge migrations, and service-role writes.

**Decision:** `changed_by` is populated from `NEW.seller_id` (the row's owner). Sellers can only edit their own listings under RLS, so `seller_id` is the actor in ~99% of price changes. Admin price overrides — the remaining 1% — are not the price_history canonical record; they're captured in `admin_action_log` with full admin attribution and the before/after `price_kobo` in metadata.

**Trade-off:** the price_history feed shown to buyers in Phase F+ (price drop alerts) attributes the change to the seller even when an admin made it. Acceptable — buyers care about the price trajectory, not who pressed save.

**Operational:** if we ever need true `auth.uid()` attribution in a trigger, the pattern is `(current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid` with a NULL fallback for service-role contexts. Documented here as a reference; not used in E.1.2.

---

## D-072: `escrow_orders` → `orders` data migration deferred to Phase G+

**Context:** Phase A shipped `escrow_orders` (12 columns) as a placeholder for future fulfillment. Phase E ships the canonical fulfillment schema as a set of empty tables (`orders`, `order_status_history`, `shipping_quotes`, `escrow_transactions`, `shipping_addresses`, `delivery_partners`). D-059 retained `escrow_orders` rather than dropping or renaming it, so both shapes co-exist in production through Stage 1.

**Decision:** No data migration in Phase E. `escrow_orders` remains untouched (any rows preserved, schema unchanged). The new Phase E `orders` + `escrow_transactions` start empty and stay empty until Phase G+ ships fulfillment. Phase G+ owns the migration.

**Migration map for the Phase G+ engineer** (P6 diagnostic captured during E.1.3 pre-flight):

| Phase A `escrow_orders` column | Phase E target | Notes |
|---|---|---|
| `id` | `orders.id` | preserve UUID |
| `product_id` | `orders.listing_id` | column renamed |
| `buyer_id` | `orders.buyer_id` | direct |
| `seller_id` | `orders.seller_id` | direct |
| `amount_kobo` | `orders.amount_kobo` + `escrow_transactions.amount_kobo` | denormalized into both |
| `currency` (enum) | (none) | NGN-only; drop the enum reference, hardcode NGN in app |
| `status` | `orders.status` + `escrow_transactions.status` | needs status-value remap |
| `paystack_transaction_reference` | `escrow_transactions.provider_reference` (with `payment_provider = 'paystack'`) | provider locked in Phase A; Phase E externalizes |
| `shipping_note` | (none in current Phase E schema) | preserve in `orders` metadata JSONB if added, or `order_status_history.reason` |
| `dispute_reason` | `order_status_history.reason` (on status='disputed' transition) | inline → externalized |
| `created_at` | `orders.created_at` | direct |
| `updated_at` | (derived from `order_status_history`) | drop column |

**Operational:**
- Drop `escrow_orders` after Phase G+ migration is verified end-to-end on production.
- If Phase A `escrow_orders` has zero rows at Phase G+ start (which is likely — Phase A never shipped checkout), the "migration" is just `DROP TABLE escrow_orders` and we skip the column-mapping work entirely. Bank the check `SELECT COUNT(*) FROM escrow_orders;` as Phase G+ pre-flight step zero.

---

## D-073: NIN verification flow is Pattern B (hybrid — verify at risk moments, not at signup)

**Context:** Three patterns considered for when NIN verification happens in the buyer/seller lifecycle:
- **Pattern A — sync at signup:** NIN required before account creation completes. Highest friction, lowest abandonment risk after signup.
- **Pattern B — hybrid:** account creation works without NIN (phone OTP only). NIN gates specific high-trust actions: seller verification upgrade, contact reveal as buyer, Pro tier purchase. Buyers without NIN can browse, message, and use free-tier features.
- **Pattern C — lazy:** NIN never proactively required; only triggered post-fraud-flag.

**Decision:** Pattern B. Signup stays low-friction (phone-only) to maximize top-of-funnel conversion, then NIN gates the moments where verified identity matters most to the trust model — seller verification, Pro reveal, payment flows.

**Operational:**
- Buyers can complete the entire free-tier journey without NIN.
- First NIN prompt for buyers: when they tap "Upgrade to Pro" or buy a credit pack.
- First NIN prompt for sellers: when they apply for verified seller status (Phase C.5 flow).
- NIN verification result stored in `kyc_documents` (schema in E.1.3, populated Stage 2+).

> **Owner: confirm wording** — if the prior framing of Pattern B differs, send the canonical version and I'll edit.

---

## D-074: Vendor selection — Paystack for payments, Korapay for NIN; Dojah deprioritized

**Context:** Phase E ships Pro tier monetization (Paystack) and identity verification for trust signals (NIN, eventually BVN). Vendor evaluation covered Paystack, Flutterwave, Monnify for payments; Dojah, VerifyMe, Smile ID, Prembly, Korapay Identity for NIN.

**Decision:**
- **Payments — Paystack primary.** Ubiquitous in NG developer ecosystem, Stripe-backed (acquisition completed 2020), spec-default in PHASE_E_SPEC.md, well-documented sandbox.
- **NIN — Korapay Identity primary.** Self-serve dashboard request flow (request Identity service after Live Mode KYC approval), no sales-gated signup, transparent pricing.
- **Dojah deprioritized** — sales-gated signup blocked self-serve evaluation. Re-evaluate as fallback if Korapay Identity approval is delayed (see D-077) or if Korapay's NIN endpoint reliability proves insufficient in Stage 2 integration testing.

**Operational:**
- Korapay account created; Live Mode KYC submitted; Identity service request pending Live Mode approval. Expected 1–3 business days for Live Mode, additional time for Identity service.
- Paystack integration scaffolded in E.1.7 behind `PaymentGateway` interface (D-078).

---

## D-075: NIN schema design deferred to Stage 2 (post-Korapay integration)

**Context:** E.1.3 created `kyc_documents` as an empty Phase H+ stub with minimal columns (`user_id`, `document_type`, `document_reference`, `verification_status`, `verified_at`). The full column shape depends on what Korapay Identity actually returns at API call time — confidence scores, metadata fields, photo URLs, response envelopes vary across NIN vendors.

**Decision:** Don't lock the `kyc_documents` final shape until Korapay Identity is integrated and we've seen real API responses. Stage 2 NIN integration owns the schema finalization — at that point we either add columns via ALTER TABLE or accept the minimal shape if Korapay's response fits.

**Operational:**
- E.1.3's `kyc_documents` is intentionally under-specified. No app code reads from it in Stage 1.
- Stage 2 NIN integration paste-back will include any required ALTERs to `kyc_documents` before any rows get written.

> **Owner: confirm wording** — if the prior framing of "schema design deferred" was more specific (e.g., named columns to add), send the canonical version.

**Stage 2 PII discipline (banked during E.1.4 RLS planning):** when Stage 2 finalizes `kyc_documents` columns alongside Korapay Identity integration, raw provider response data (Korapay/Dojah confidence scores, biometric flags, full provider JSON envelopes) must NOT be exposed via the user-facing self-read policy. Three patterns to choose between at Stage 2 design time:
1. **Split tables** — `kyc_documents` (user-facing summary: status, verified_at, document_type) + `kyc_documents_audit` (full provider response, admin-only RLS). Cleanest separation; doubles the row count per verification.
2. **Views** — base table holds everything; a `kyc_documents_user` view strips audit columns and self-read policy applies to the view, not the base table.
3. **Column-level RLS** — Postgres supports column-level grants (`GRANT SELECT (col1, col2) ON kyc_documents TO authenticated`). Self-read policy at row level + column grants gate which columns the user sees. Most fragile pattern (easy to miss new audit columns at ALTER time); also harder to express in Drizzle schema mirror.

Lean toward (1) — split tables — for explicit separation of user-facing summary from audit payload. Don't action now; decide at Stage 2 alongside the column-shape finalization.

---

## D-076: BVN extension deferred to Phase F+ (NIN sufficient for Phase E trust model)

**Context:** NIN (National Identification Number) is the primary identity document for individuals in Nigeria. BVN (Bank Verification Number) is the banking-tied identity document and is required for any flow that touches escrow, payouts, or financial settlement. Phase E's verified identity needs are: seller verification (NIN sufficient), contact reveal (NIN sufficient), Pro tier purchase (NIN sufficient for buyer trust).

**Decision:** Ship Phase E with NIN-only via Korapay. Add BVN extension in Phase F+ when escrow / seller payouts / financial flows arrive.

**Operational:**
- Phase E `kyc_documents.document_type` accepts `'nin'` only in Stage 2.
- Phase F+ Korapay integration adds BVN as a second `document_type`. Korapay Identity covers both, so the same vendor relationship extends.
- If Korapay BVN endpoint proves unreliable in Phase F+ testing, re-evaluate fallback (Mono/Okra are BVN-specialized alternatives).

---

## D-077: Korapay approval-delay fallback — manual seller verification (Phase C.5 baseline)

**Context:** Korapay Identity service requires (a) Live Mode KYC approval, then (b) Identity service request approval. Either gate could push past Stage 2 timeline. Phase E ships regardless of vendor timing.

**Decision:** If Korapay Identity approval is not complete by the start of Stage 2 NIN integration work, Phase E ships with **manual seller verification only** — the existing Phase C.5 admin-reviewed flow. Auto-NIN moves to Phase F+ and `kyc_documents` stays empty through Phase E.

**Operational:**
- Stage 2 pre-flight: check Korapay Identity status. If approved → integrate. If not → skip NIN scope for Phase E, document the deferral in KNOWN_ISSUES.md, proceed to Stage 3.
- Pattern B (D-073) still holds — sellers verify via the manual admin flow, buyers don't see a NIN prompt at all in Phase E if this fallback triggers.
- Decision doesn't block any other Stage 2 work (signup, messaging, contact reveal all independent of NIN).

---

## D-078: Two-vendor architecture — `PaymentGateway` (Paystack-primary) + `NinVerifier` (Korapay-primary), both interface-first

**Context:** Phase E uses two distinct third-party vendors for two distinct concerns. Both have non-trivial failure modes (carrier-side SMS issues, vendor downtime, API rate limits) and both have plausible future fallback vendors. Coupling app code directly to either vendor's SDK invites lock-in and makes Phase F+ vendor changes expensive.

**Decision:** Interface-first scaffolding for both vendors:
- **`PaymentGateway`** interface lands in E.1.7. Methods cover charge initiation, charge verification, refund, subscription create/cancel, webhook signature validation. `PaystackGateway` is the only Phase E implementation. `KorapayGateway` is named in code as the documented fallback target, not implemented in Phase E (no concrete Korapay payment work until BVN/escrow Phase F+).
- **`NinVerifier`** interface scaffolded in Stage 2. Methods cover `verifyNin(nin, person_details)`, `getVerificationResult(verification_id)`. `KorapayNinVerifier` is the only Phase E implementation. `DojahNinVerifier` is the named fallback target, not implemented.

**Operational:**
- Vendor SDKs (Paystack SDK, Korapay SDK) imported only inside the respective gateway implementations — never at app-route level. App code holds the interface, dependency-injected at the route handler.
- Webhook handlers (Paystack webhook, Korapay webhook) live in vendor-specific route files and translate vendor payloads into interface-level events before passing to domain logic.
- Tests mock the interface, not the SDK — Stage 2+ test suites stay vendor-agnostic.

---

## D-079: Decision-flow consistency discipline — owner must explicitly acknowledge reversals

**Context:** During Phase E Stage 1, the `admin_audit_log` resolution went through two opposite framings in adjacent turns (May 2026):
1. Owner proposed "deprecate but don't DROP, add Phase G+ review trigger"
2. Agent counter-proposed "DROP cleanly, zero rows = zero risk"
3. Owner greenlit the DROP migration in the next turn without explicitly acknowledging the reversal from (1) to (2)
4. The DROP shipped
5. Subsequent owner turn re-asserted the original "deprecate, don't DROP" framing as if (2)–(4) hadn't happened

Net cost: D-081 was banked three times in the doc — original DROP framing, then deprecate-not-drop with Phase G+ review trigger, then DROP-final reflecting shipped reality. Three commits on the same decision, each contradicting the previous, when one explicit acknowledgement at step 3 would have kept the decision log linear.

**Decision:** When the agent counter-proposes against the owner's prior recommendation, the owner must explicitly acknowledge the reversal in the next response before greenlighting — not silently agree by proceeding. Required surface format:

> "Confirmed — reversing my prior recommendation [original framing] in favor of [counter-proposal] for reasons X, Y."

Silent agreement (greenlighting the counter-proposal without naming the reversal) creates contradictory entries in the decision log.

**Operational:**
- The discipline binds the owner side of the planner ↔ owner ↔ agent loop. The agent's responsibility is to propose alternatives with reasoning, not to verify the owner read the reasoning before greenlighting.
- The agent should still draft its decisions defensively — when shipping a decision that contradicts the most recent owner framing, include a brief "Reversing prior framing of X in favor of Y based on owner greenlight in [turn]" header in the commit message and DECISIONS.md entry. Catches the discrepancy at write-time when the cost of fixing is minutes, not at production-discrepancy time when it's a doc-rewrite cycle.
- This discipline applies to both the owner and the agent equally — if the owner reverses a position the agent banked, the same acknowledgement format applies. Reversals are fine; silent reversals are not.

**Banked retroactively after the admin_audit_log incident.** D-079 was the placeholder slot that stayed open through D-080/D-081 banking; reserved deliberately for whichever workflow lesson the Stage 1 cycle surfaced. This was it.

---

## D-080: Post-rename FK constraint name hygiene — deferred to low-risk maintenance window

**Context:** E.1.1 renamed `subscriptions.profile_id → user_id` and column references on `contact_reveals` (per D-055 reshape). Postgres correctly auto-updated each constraint's column reference, but the constraint *names* — baked at original-create time by Drizzle's `<table>_<col>_<reftable>_<refcol>_fk` convention — kept their pre-rename column names embedded. Surfaced during Phase E Stage 1 schema-refresh dump (DRIFT #1 + DRIFT #2):

- `contact_reveals_product_id_products_id_fk` — constraint references the column now named `listing_id`
- `subscriptions_profile_id_profiles_id_fk` — constraint references the column now named `user_id`
- Plus the buyer/seller variants on `contact_reveals` (column names didn't rename, but the table touched in the reshape so flagged together).

**Decision:** Cosmetic-only — constraints are functional and enforce the right invariants. Do NOT rename in Phase E (renaming a FK constraint requires `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ...`, briefly losing FK enforcement). Defer to a dedicated low-risk maintenance window where:
1. All affected tables are confirmed empty or low-traffic
2. The rename runs inside a single transaction
3. Phase F+ Drizzle schema-mirror generation produces the canonical names anyway, so the maintenance window may coincide with that work

**Operational:**
- Document the discrepancy in ACTUAL_SCHEMA.md alongside the affected tables so future readers don't misread the column name from the constraint name.
- Add to the standing rename pre-flight (alongside D-055 pg_proc scan, D-069 index hygiene): scan `pg_constraint` for FK constraint names containing the old column name *before* the rename happens, plan the constraint-rename as part of the same migration if the table is large or high-traffic.
- Diagnostic pattern:
  ```sql
  SELECT conname, conrelid::regclass AS table_name
  FROM pg_constraint
  WHERE conname ILIKE '%<old_column_name>%';
  ```

**Additional Phase E constraint flagged for the maintenance window (banked during E.1.5):**
- `filter_actions_log_rule_id_filter_rules_id_fk` — agent named this FK using Drizzle's `_<reftable>_<refcol>_fk` convention when adding it via ALTER TABLE in E.1.5. Phase E's other FKs (created inline in CREATE TABLE) auto-named as `_fkey` per Postgres default. Mixing the two conventions inside Phase E creates the same inconsistency D-080 is meant to clean up across phases. Rename target: `filter_actions_log_rule_id_fkey`.

**Catch-all scope expansion (banked during E.1.6):** D-080 is the canonical home for all cosmetic Phase A → Phase E hygiene deferrals — not just FK constraint names. Additional cleanup targets to address in the same maintenance window:

- **Dead Phase A enum types in Postgres** (currently retained, marked `[DEPRECATED]` in `src/db/schema/enums.ts`):
  - `subscription_tier` — superseded by `subscriptions.plan_code` (TEXT) post-E.1.1 reshape.
  - `subscription_status` — superseded by `subscriptions.status` (TEXT) post-E.1.1 reshape.

  Both Postgres enum types remain in the schema with zero remaining column references. Drop via `DROP TYPE public.subscription_tier; DROP TYPE public.subscription_status;` once any in-flight tooling that introspects pg_type has been verified clean. Mirror cleanup in Drizzle: remove the `subscriptionTierEnum` and `subscriptionStatusEnum` exports from `src/db/schema/enums.ts`.

- **Ordinal-position gaps on reshaped tables** (subscriptions positions 3/4/5/6/7/10/11/13; contact_reveals positions 5/6/7) — purely cosmetic, standard Postgres behavior after DROP COLUMN. No fix required; documented in ACTUAL_SCHEMA.md so future readers don't reference `ordinal_position` from a tool query as if it were the column count.

The maintenance window's full pre-flight checklist now covers: (a) stale FK constraint names from column renames, (b) the Phase E `filter_actions_log_rule_id_filter_rules_id_fk` naming-convention mismatch, (c) dead Phase A enum type drops, (d) any other cosmetic drift surfaced between now and the window. Should run as one BEGIN/COMMIT-wrapped migration with V-paste-back per change, same discipline as Phase E.1.x sub-migrations.

**Scope clarification (banked during E.1.4.b execution):** Postgres auto-rewrites column *references* in RLS policy bodies on column rename — verified by E.1.4.b pre-check on `subscriptions_self_read`, whose `qual` already showed `auth.uid() = user_id` even though the policy was created against `profile_id` in Phase A. Post-rename hygiene scope therefore narrows:

- ✅ **Auto-rewritten by Postgres on column rename** (no manual fix needed): RLS policy bodies (`pg_policies.qual`, `pg_policies.with_check`), CHECK constraint expressions, generated column expressions, view definitions, function bodies that reference columns by name in SQL (NOT in dynamic SQL strings).
- ❌ **NOT auto-rewritten** (manual cleanup needed): constraint *names* (D-080), index *names* (D-069), function bodies that build SQL dynamically via `format()` / `||` / `EXECUTE` (D-055 pg_proc scan still required), comments in code that reference column names.

The standing pre-flight diagnostic trio (pg_proc / pg_indexes / pg_constraint scans) catches the manual-cleanup cases. Policy bodies don't need a separate scan — Postgres has us covered there.

---

## D-081: Phase A `admin_audit_log` dropped in E.1.3.1; `admin_action_log` is canonical

**Context:** Phase A shipped `admin_audit_log` as a generic audit table (6 columns: `id`, `actor_id → profiles(id)`, `action TEXT`, `target TEXT`, `metadata JSONB`, `created_at`). Phase E.1.2 introduced `admin_action_log` (10 columns: `id`, `admin_id → admins(id)`, structured `target_type` + `target_id`, `action`, `reason`, `notes`, `metadata`, `case_id`, `created_at`). Both tables coexisted briefly after E.1.2.

**Investigation** (Phase E Stage 1 schema-refresh dump, DRIFT #4):
- `admin_audit_log` row count: 0 (never written to in Phase A or C.5)
- Foreign keys referencing `admin_audit_log`: 0
- Application code references: none
- Schema-level coupling: zero

**Decision:** Drop `admin_audit_log` in micro-migration **E.1.3.1**. With zero rows, zero FK references, and zero application writes across Phase A/B/C/D, carrying the legacy table forward as deprecated served no purpose — it would have invited fragmented audit writes from future code and added a permanent `[DEPRECATED]` tombstone to the canonical schema reference. Dropping cleanly produces a single source of truth.

`admin_action_log` is canonical for all admin/moderation audit going forward.

**Reasoning:**
1. `admin_action_log` is strictly more structured: typed `target_type` + `target_id` UUID is queryable in ways `target TEXT` is not.
2. `case_id` column enables Phase F+ case clustering with zero further migration.
3. FK to the separated `admins` entity (Phase E §14 / D-078 two-vendor architecture) is the correct admin model going forward — `admins` accommodates account managers, multi-role admins, etc.
4. With zero data to preserve, drop-now is cheaper than carrying the table + adding a "remember to revisit at Phase G+" review trigger that could be forgotten.

**Note on prior framing:** D-081 was briefly re-banked as "deprecate-not-drop with Phase G+ review trigger" before the DROP migration shipped. That intermediate framing is overtaken by execution — the table is physically gone, no review trigger is needed.

**Operational:**
- E.1.3.1 shipped: pre-flight assertions (0 rows + 0 FK references) passed, `DROP TABLE public.admin_audit_log;` executed inside transaction, `NOTIFY pgrst, 'reload schema'` issued. V1–V4 all green.
- The associated `admin_audit_log_admin_read` RLS policy was auto-dropped with the table.
- Total `public` table count: 43 → 42.
- ACTUAL_SCHEMA.md refresh removes the `admin_audit_log` entry entirely.
- E.1.4 RLS block writes fresh policies for `admin_action_log` from scratch.
- Phase A's `actor_id → profiles(id)` model (admins = profiles with `role='admin'`) is left to Phase F+ for full unification with the new `admins` entity. `is_admin(auth.uid())` continues to check `profiles.role = 'admin'` during the transition — separate decision, not Phase E scope.

---

## D-082: Premium Buyer subscription tier eliminated; escrow becomes pay-per-use

**Context:** v1 monetization plan included a Premium Buyer subscription tier at ₦7,500/mo whose primary benefit was access to escrow protection. Deeper Nigerian-market analysis (PiggyVest / Cowrywise consumer subscription benchmarks; per-transaction buyer behavior in high-trust categories) showed Nigerian buyers do not pre-commit to monthly subscriptions for *optional* protection on rare high-value purchases (typical buyer transacts 1–3 high-value items per year).

**Decision:** Eliminate the Premium Buyer subscription tier entirely. Escrow becomes **pay-per-use, available to all buyers** including Free Buyer, at standard rate **1.5% + ₦100**. Pro Buyers receive a discounted rate as part of their subscription (see D-086). There is no separate "Premium Buyer" subscription.

The restructured buyer ladder is: **Free → Pro → Institution**, with Diaspora as a separate Pro variant (USD-priced) for international buyers.

**Operational:**
- Server-side escrow fee computation enforces tier-based rates (per D-086).
- Marketing should never frame escrow as "Premium feature" — it's a universally available service with a Pro discount.
- Pro Buyer value proposition rebalances to: contact reveal + SMS alerts + Pro badge + escrow discount + priority dispute response time (per D-089).

---

## D-083: Pro Buyer contact reveal caps tiered to prevent harvesting

**Context:** Unlimited contact reveals for Pro Buyers creates an exploit vector: a single bad actor pays ₦5,000 once, scrapes contact details for thousands of verified sellers, and resells the list. The platform's seller trust depends on contact details NOT becoming a commodity, so per-Pro-Buyer reveal caps are required.

**Decision:** Daily reveal caps tiered by Pro tenure and standing:

| Buyer state | Daily reveal cap |
|---|---|
| New Pro Buyer (first 30 days of subscription) | 10 reveals/day |
| Established Pro Buyer (30+ days, no open reports) | 25 reveals/day |
| Institution Buyer | Custom (negotiated per contract) |
| Free Buyer / credit-pack user | Bounded by purchased credits (no daily cap, but finite pool) |
| New buyer with signup-grant free reveal (D-084) | 1 lifetime free reveal |

**Operational:**
- `get_buyer_reveal_cap(p_user_id UUID) RETURNS INT` SQL function implements the tier check (E.2.0.1 ships this).
- "No open reports" means zero rows in `reports` where `target_type='user' AND target_id=user_id AND status IN ('new', 'in_review')` — computed on read inside the function, not denormalized.
- Reveals consumed against cap reset at 00:00 Africa/Lagos.
- Cap exhaustion shows clear messaging: "You've used X of Y reveals today; resets at midnight Lagos time."

---

## D-084: Pro Buyer trial replaced with 1 free reveal at signup

**Context:** v1 plan proposed a 14-day full Pro trial including unlimited reveals. This is a contact-harvesting attack vector — a fraudster signs up, scrapes seller contacts for 14 days, abandons the account, repeats. Even with phone OTP verification, SIM swap and burner numbers make 14-day full-Pro trials unsafe.

**Decision:** No Pro trial. Instead, **every new buyer receives 1 free contact reveal at signup**. Bounded, attack-resistant, generous enough to demonstrate the contact-reveal feature value.

**Operational:**
- `profiles.signup_free_reveals_remaining INT NOT NULL DEFAULT 1` tracks the grant (E.2.0.0 ships this).
- First reveal a new buyer attempts consumes the free grant (decrements to 0).
- After exhaustion, the buyer must purchase a credit pack or subscribe to Pro to reveal again.
- Existing buyers (`created_at < deployment_date - 30 days`) are backfilled to 0 — they've had ample opportunity to discover the feature pre-grant; new grant is for fresh signups only.
- Existing buyers (`created_at >= deployment_date - 30 days`) are backfilled to 1 — they're recent enough to count as "new" by intent.

---

## D-085: Credit pack structure locked

**Context:** Pay-per-use contact reveal is the dominant expected buyer-revenue stream (per D-082 analysis, Nigerian buyers prefer pay-per-use to subscription for occasional features). Pack structure must balance entry-point accessibility (₦500 "airtime moment") with bulk-purchase incentive.

**Decision:** Four credit pack tiers:

| Pack | Price | Reveals | Effective ₦/reveal |
|---|---|---|---|
| Trial | ₦500 | 1 | ₦500 |
| Small | ₦1,500 | 3 | ₦500 |
| Medium | ₦3,500 | 9 | ₦389 |
| Large | ₦7,000 | 20 | ₦350 |

**Operational:**
- The ₦500 Trial pack is positioned as the entry-point "airtime moment" — every Nigerian buyer is comfortable buying ₦500 airtime, and the price point removes friction from first-reveal commitment.
- Pro Monthly (₦5,000/mo) is positioned for power users exceeding ~4 reveals/month, where subscription breakeven kicks in.
- Marketing must never frame Trial pack and Small pack as equivalent — they cost the same per reveal, but Trial is the "try once" path and Small is the "commit to a few" path.
- Pack purchases are tracked via the `payments` table with `payment_type='credit_pack'` and a new `pack_type` enum (`'trial' | 'small' | 'medium' | 'large'`) — E.2.0.4 ships this enum.
- Credits accumulate on the `credit_balances` table (running balance only, no per-pack metadata).

---

## D-086: Pro Buyer escrow fee discount

**Context:** Pro Buyer subscription needs value differentiation beyond contact reveal — after D-082 eliminated Premium Buyer escrow gating, Pro becomes the only subscription tier and needs structural advantages across the buyer journey, not just at first-touch.

**Decision:** Pro Buyers receive a **discounted escrow fee of 1.2% + ₦100** vs the standard **1.5% + ₦100** rate. The discount applies to all eligible protected transactions (₦50,000+).

| Transaction | Standard fee (Free / credit pack) | Pro Buyer fee |
|---|---|---|
| ₦50,000 | ₦850 | ₦700 |
| ₦100,000 | ₦1,600 | ₦1,300 |
| ₦180,000 | ₦2,800 | ₦2,260 |
| ₦500,000 | ₦7,600 | ₦6,100 |
| ₦1,000,000 | ₦15,100 | ₦12,100 |

**Operational:**
- `compute_escrow_fee(p_amount_kobo BIGINT, p_user_id UUID) RETURNS BIGINT` SQL function enforces tier-based rates server-side (E.2.0.2 ships this).
- Client-side fee display calls a read-only API; server recomputes on escrow initiation. Client-supplied fee values are never trusted.
- Pro tenure check inside the function: function looks up `subscriptions` for active subscription where `user_id = p_user_id AND status = 'active' AND current_period_end > NOW()`.
- Eligibility threshold of ₦50,000 applies to both tiers; below that, escrow is not offered (per existing Phase E spec).

---

## D-087: Pro Buyer launch promo — ₦3,000/mo first 3 months

**Context:** Launch-period pricing needs to be aggressive enough to overcome cold-start friction (no early-adopter advocacy, no peer-review yet) while still establishing a defensible standard price point post-promo.

**Decision:** Pro Buyer subscription priced at **₦3,000/month for the first 3 months** after a buyer's subscription start date. Standard price of **₦5,000/month** thereafter. Annual price unchanged at **₦45,000/year** (no promo applies to annual — annual buyers self-select as committed and the ₦45K already encodes ~25% discount vs 12× monthly standard).

**Operational:**
- "Launch" trigger TBD operationally — current intent: first verified buyer signup completed after Stage 2.A (Termii OTP integration) ships, marking the platform's true production launch. Hard-coding this trigger requires Frank's call closer to Stage 2.A landing.
- `subscriptions.promo_code TEXT` and `subscriptions.promo_expires_at TIMESTAMPTZ` track promo state (E.2.0.3 ships this).
- Promo code value for this launch promo: `'LAUNCH_3K'`.
- `promo_expires_at = subscription_created_at + INTERVAL '90 days'`.
- After expiry, Paystack subscription renewal proceeds at the ₦5,000 standard rate. Buyer is notified via email + in-app 14 days before promo expiry: *"Your launch promo expires on [date]; subscription renews at ₦5,000/mo. Lock in launch pricing for the year — switch to annual at ₦45,000."*
- Promo applies to subscription creation date, not calendar window — a buyer signing up at month 11 of the launch year still gets 3 months at ₦3,000.

---

## D-088: Founding Seller offer — first 100 verified sellers

**Context:** Marketplace bootstrapping requires supply-side subsidy. Without verified sellers, buyer acquisition produces churn. Founding Seller offer rewards the cohort that takes early reputational risk on an unproven platform.

**Decision:** The first 100 verified sellers receive:

1. **6 months Pro Seller free** — the free period starts when **Phase F (seller monetization) launches**, not at seller signup. Sellers verified before Phase F see "Pro Seller features unlock free when Phase F launches" in their dashboard.
2. **Permanent "Founding Seller" badge** — displayed alongside Verified Seller badge; distinct from paid-tier badges.
3. **Grandfathered ₦7,500/month Pro Seller pricing for life** — Phase F+ price increases never apply.
4. **Priority onboarding** — direct founder-led setup support.
5. **Free listing-quality review** — one-time review of all listings with feedback on quality, photos, descriptions.
6. **Early seller feedback group access** — direct line to product team for feature requests / friction reports.

**Operational:**
- Founding Seller status tracked on the **`businesses` table** (not `profiles` — seller-specific attributes belong to the seller entity):
  - `is_founding_seller BOOLEAN NOT NULL DEFAULT FALSE`
  - `founding_seller_granted_at TIMESTAMPTZ`
  - `grandfathered_pro_price_kobo INTEGER` — set to `750000` (₦7,500) for Founding Sellers, NULL for others
- Phase E Stage 2.B (seller foundation work) ships the **schema infrastructure** but does NOT execute the badge grants. Grants happen at Phase F launch via an admin-run script that selects the first 100 sellers ordered by `seller_verifications.reviewed_at ASC` where `seller_verifications.status = 'verified'`.
- Founding Seller badge is displayed via `is_founding_seller=true` check; Phase F UI work surfaces it.

---

## D-089: Trust & safety operates equally regardless of tier

**Context:** Paid-tier perks can erode trust positioning if they appear to influence dispute outcomes. The platform's marketing thesis depends on dispute fairness being seen as universal.

**Decision:** Paid tiers (Pro Buyer, Pro Seller, Premium Seller, Institution) receive **faster operational response times** on support and dispute queues. They do NOT receive **preferential dispute outcomes** — every escrow dispute is reviewed against the same evidentiary standards regardless of buyer or seller tier.

**Tier-based SLA scaffolding** (Phase F operationalization):

| Tier | First-response SLA | Resolution target |
|---|---|---|
| Institution | 4 business hours | 24 business hours |
| Pro Buyer / Pro Seller | 24 business hours | 5 business days |
| Free Buyer / Free Seller | 5 business days | 14 business days |

**Operational:**
- Phase E ships manual moderation with no formal SLA tier separation (operational reality of single-operator launch).
- Phase F implements queue prioritization in the admin dashboard.
- Dispute case reviewers are not informed of buyer/seller tier during evidence evaluation — tier metadata appears in case files but is segregated from the evidence-review surface to prevent unconscious bias.
- Public-facing copy: *"We respond faster to Pro members; we resolve every dispute the same way."*

---

## D-090: Mobile money channels enabled at Paystack launch

**Context:** Nigerian transaction reality skews heavily toward mobile money (OPay, PalmPay, Kuda, MoniePoint) and bank transfer rather than cards. Card-only payment would lock out a material share of the addressable market — particularly younger buyers and informal-economy participants who are core to the high-intent segment ShowMePrice targets.

**Decision:** Paystack integration in Stage 2.B (`PaystackGateway` concrete implementation) must explicitly enable the following channels at first launch, not as a Phase F+ enhancement:

- **Card** (Mastercard, Visa, Verve)
- **Bank transfer** (covers OPay, PalmPay, Kuda, MoniePoint, traditional bank apps)
- **USSD** (feature-phone fallback for buyers without smartphone banking)
- **Mobile money** (where Paystack's mobile money channel covers it)

**Operational:**
- Paystack `channels` array parameter on transaction initialization must include: `['card', 'bank_transfer', 'ussd', 'mobile_money']`.
- App UI must show all available channels at checkout, not card-only.
- Test plan: at minimum, one successful end-to-end transaction per channel before Stage 2.B ships to production.
- Channel failure handling: if a buyer's primary channel fails (e.g., OPay outage), the UI prompts retry with a different channel rather than blocking the transaction.

---

## D-091: Seller monetization deferred to Phase F

**Context:** Year 1 marketplace strategy prioritizes trust velocity over revenue extraction. Sellers will not pay for tools until they see buyer demand on the platform; charging too early drives sellers off before the network effect compounds.

**Decision:** Phase E ships **seller-side foundation only** — no seller monetization. Specifically:

**Phase E seller scope (foundation, all free):**
- Seller profile creation and edit flow
- Listing creation with mandatory visible price (per Banked Principle 5)
- Listings in priority Phase E categories: phones, laptops, electronics, appliances, generators
- In-app inbox structure (no external messaging integrations)
- Verification application form and admin review queue (uses Korapay NinVerifier per D-074)
- Founding Seller badge infrastructure (per D-088)
- Seller report/block tools
- Mark-item-as-sold flow

**Phase E sellers retain unlimited listings** per the existing `businesses.seller_listing_limit` nullable=unlimited spec. The 10-listing cap is a Phase F constraint applying only to the Free Seller tier when monetization launches.

**Deferred to Phase F:**
- Pro Seller subscription (₦7,500/mo)
- Premium Seller subscription (₦15,000–₦20,000/mo, Phase F+)
- Listing boosts (₦2,500–₦9,000)
- Featured Seller placement
- Seller analytics dashboard
- Seller storefront customization
- Bulk upload
- API access (Institution Seller)
- Free Seller tier limits (10 listings, 3 photos, no boosts)

**Operational:**
- Phase E Year 1 revenue is buyer-side only (Pro Buyer subscriptions, credit packs, escrow fees, Diaspora Buyer subscriptions).
- Phase F launch trigger: defined by buyer-side traction metrics (TBD) — likely 250+ verified sellers active + 10,000+ active buyers + measurable seller demand for Pro tooling.
- Founding Seller 6-month free Pro Seller period (D-088) starts at Phase F launch, not at seller verification — sellers verified during Phase E "bank" the free period until monetization arrives.

---

## D-092: Existing subscriber grandfathering on pricing revisions

**Context:** `MONETIZATION-PLAN.md` v2.0 establishes Pro Buyer (₦5,000/mo), Pro Buyer launch promo (₦3,000/mo first 3 months), escrow rates (1.5% / 1.2% Pro), credit pack tier amounts, and the Phase F Pro Seller price (₦7,500/mo) as committed launch positions. The Validation Disclosure in that document reserves the right to revise pricing in two scenarios — quarterly Year 1 review and material market signal — with revisions banked as new D-numbers. This decision specifies what happens to **existing paid subscribers** when a revision lands.

**Decision:** Any future pricing revision to Pro Buyer subscription, Pro Seller subscription, or escrow rates **grandfathers existing active paid subscribers at their prior pricing for the duration of their active subscription period**. This applies regardless of how the revision is triggered (quarterly review or material signal).

**Operational:**
- Active monthly subscribers continue paying the original rate until cancellation or non-renewal. New rate applies on next renewal after their current period ends.
- Active annual subscribers continue at the original annual rate through the full 12-month term. New rate applies on renewal.
- Escrow fee revisions apply at transaction initiation time — there is no "in-flight transaction" pricing concept since escrow is per-use. However, if a Pro Buyer subscribed before a Pro discount-rate revision, they retain their original discount rate for the duration of their subscription.
- Founding Seller grandfathered ₦7,500/mo Pro Seller pricing (D-088) is permanent — it does NOT expire at next renewal even if Pro Seller pricing is revised. D-088's lifetime guarantee supersedes D-092's subscription-period scope for Founding Sellers specifically.
- Marketing surface: pricing revision announcements explicitly call out the grandfathering. "Existing Pro Buyers stay at ₦5,000/mo for the duration of your current subscription period. New Pro pricing applies on renewal."

**Rationale:**
1. Protects subscriber trust on a trust-first brand. A "we just raised your price" email midway through a subscription period is a brand-damaging move incompatible with the positioning.
2. Cost-neutral until renewal — no immediate revenue impact, just deferred. The downside is a few months of mixed-pricing operational complexity at the moment of revision.
3. Consistent with the Founding Seller lifetime-grandfathering principle (D-088) — same brand promise, scoped narrower (subscription period vs lifetime).
4. Removes a class of subscriber dispute — "you changed my price without my consent" — that would otherwise consume trust & safety operational hours.

---

## D-093: Phone-verification gate reaches contact-reveal when that flow ships

**Context:** Phase E Stage 2.A established phone OTP verification (`profiles.verification_status` contains `'phone_verified'`) and locked decision #3: phone verification gates **contact-reveal + listing-creation**, not signup. Step 5 implemented the hard gate (`requirePhoneVerified` for pages, `isPhoneVerified` for actions' inline-error path) for **listing-creation only** — the contact-reveal flow does not yet exist (the listing page shows a disabled "Contact reveal coming soon" placeholder; there is no reveal action, no `contact_reveals` write, no reveal-cap enforcement). Building the reveal flow is materially larger than gating it (action + `contact_reveals` insertion + `get_buyer_reveal_cap` enforcement + reveal-credit payment integration + UI state), so it is out of Stage 2.A scope.

**Decision:** When the contact-reveal flow is built (post-Stage-2.A), it **must apply the same phone-verification gate** established for listing-creation:
- The reveal entry point (page or action) gates on `isPhoneVerified` / `requirePhoneVerified`.
- Page-level reveal UI → redirect to `/verify-phone?next=/listings/<id>` (return-to-intent to the listing being viewed).
- A JSON/API reveal endpoint → return a 403 + a body the client interprets to trigger the verify prompt (the D.5/D.6 modal), rather than a server redirect.

This is a **forward commitment**, not a known bug — banked in DECISIONS.md (not KNOWN_ISSUES.md) so the second intended call site isn't forgotten when the underlying feature ships.

**Reference pattern:** the listing-creation gate landed in the Stage 2.A Step 5 commit — `requirePhoneVerified(supabase, user.id, "/listings/new")` on the page after the business-verified check, and an `isPhoneVerified` inline-error guard in `createListingAction` after its business-verified check. Mirror that structure for reveal.

---

## D-094: OTP provider abstraction — final architecture

**Decision:** Phone OTP uses a delivery-only provider abstraction (`src/lib/otp/`), validated and shipped in Stage 2.A.

- **Lifecycle ownership: we own it.** Generation, hashing (`salt:phone:code`), expiry (10-min TTL), attempt-counting (cap 5), and rate-limiting (3/phone/hr, 10/IP/hr) all live in our code + DB (`phone_verifications`). The provider only **delivers a pre-rendered message**.
- **Vendor-specific concepts are excluded from the interface.** No `pin_id`, no `verificationId`, no Token-API patterns leak into `OtpProvider` — the interface is `sendOtp({ to, message, channel })` only. This is what makes a swap a config change.
- **Validated by the Termii→Arkesel swap:** flipping `OTP_PROVIDER_VENDOR` (Cloudflare + `.dev.vars`) switched the active provider with **zero code change**.
- **Rejected for Token-API lock-in:** Message Central "Verify Now", Termii's Token API, and Arkesel's `/api/otp/generate` were all rejected for the same reason — they own the OTP lifecycle and would couple verification logic to a vendor.

**Reference:** Stage 2.A commits `5599bac` (module), `f302483`/`13bf8d4` (DB), `46680b5` (actions).

---

## D-095: Messaging MVP scope (Stage 2.B)

**Decision:** Messaging MVP = text + images + safety layer (D-101) + basic offers (D-099). **Voice notes deferred to 2.B.5. Typing indicators deferred to 2.B.2.**

---

## D-096: First-message templates for buyer-initiated conversations

**Decision:** Buyer-initiated conversations require a first-message template. Custom freeform is allowed, but template usage is tracked (signal for response-quality + abuse analysis).

---

## D-097: Contact-pattern handling in messaging MVP

**Decision:** Phone-number / bank-account / "WhatsApp me" patterns trigger **warnings**, not hard blocks, in the MVP. Escalation to admin via trust scoring is deferred. (See D-101 for the detection pattern set.)

---

## D-098: SMS notifications restricted to high-intent events (MVP)

**Decision:** SMS notifications fire only for high-intent events: new Pro-buyer message, new offer, escrow started, seller verification approved, dispute/admin action. **All other notifications are email-only in MVP** (SMS cost discipline — ties to D-090 channel economics).

---

## D-099: Basic offer-making ships in 2.B MVP

**Decision:** Basic offers (sender → recipient with an amount) ship in the 2.B MVP. **Accept / Reject / Counter and escrow-linking deferred to 2.B.3.**

---

## D-100: Read receipts deferred; presence signals ship

**Decision:** Read receipts deferred to 2.B.2. **Last-seen + response-time signals ship in the MVP** (they feed the trust-quality surface without the per-message overhead/expectations of read receipts).

---

## D-101: Conversation safety layer is non-negotiable for MVP

**Decision:** The conversation safety layer (typed-pattern warnings) is **required** for the messaging MVP — not deferrable. Detection patterns at minimum: bank details, phone numbers, "WhatsApp me", "advance payment", "send money". Per D-097 these surface as warnings in the MVP (hard-block/escalation later). This protects the trust-first thesis from the exact off-platform-scam vector the platform exists to fix.

---

## D-102: Marketing/investor copy precision on "verified sellers"

**Decision:** Marketing/investor copy must distinguish between **"verified-seller marketplace"** (positioning — accurate) and **"every account is verified at signup"** (claim — false and unsupportable). The verification flow is explicit and earned: seller accounts exist in an unverified state and gain `'verified'` status only after successful business verification (Phase C.5 flow). Never market in a way that promises automatic verification.

**Operational:** when in doubt, use phrasing like *"verified-seller marketplace"* or *"sellers complete verification before posting"* rather than *"all sellers are verified."* This applies to the investor deck/business plan (`docs/investor/`), the marketing site, and any in-app copy.

**Rationale:** protects investor and marketing copy from drift into an unsupportable claim, and keeps the brand promise (trust is *earned*, not automatic) consistent with MEMORY.md Banked Principle 2 (verification is earned, not bought).

---

## D-103: Two-mode /verify-phone page (soft vs required)

**Date:** 2026-05-21
**Status:** Locked
**Supersedes:** None
**Related:** D-093 (contact-reveal gating — will use this same pattern when built)

### Context
Step 5 (listing-creation hard gate, b69bb98) introduced a redirect to /verify-phone for unverified sellers. The Skip button on /verify-phone blindly routes to `next=`, which re-fires the gate, trapping the user in an infinite loop. Skip was designed for soft post-signup nudges where deferring is legitimate — it's dishonest when the destination has a hard gate.

### Decision
/verify-phone operates in two modes distinguished by `required=true` query param:

- **Soft mode** (no `required` flag): post-signup nudge. "Verify your phone" + Send code + Skip routes to `next=`.
- **Required mode** (`required=true`): from a hard-gated page. "Phone verification required" + Send code + "Not ready? Go to dashboard" escape link. NO Skip.

Context-specific copy via `reason` query param mapped via `src/lib/auth/verify-phone-copy.ts`.

### Rationale
- Infinite loop is a real bug (K-018, found via Step 5 smoke 2026-05-21)
- "Required" framing is honest about why user is on this screen
- "Go to dashboard" escape prevents trapping
- Query-param mode distinction decouples /verify-phone from redirecting source's identity
- Reason-based copy decouples copy from URL routing patterns

### Implications
- `requirePhoneVerified()` gains `{ required?: boolean; reason?: string }` optional param
- `/listings/new` passes `{ required: true, reason: "listings" }`
- `/auth/callback` unchanged (still uses `phoneGateDest` for soft mode)
- D-093 (contact-reveal) when built passes `{ required: true, reason: "contact-reveal" }`, adds copy map entry then
- VerifyPhoneForm.tsx accepts `required` + `reason` props
- Escape link hardcoded to `/dashboard`

### Out of scope
- I18n / dynamic translation (static English map for MVP)
- Soft-mode Skip behavior changes (working as designed)
- Browser back button handling
- Pre-populating copy map for unbuilt features

---

## D-104: Decision-banking format standardization

**Date:** 2026-05-21
**Status:** Locked
**Supersedes:** None
**Related:** D-103 (first decision banked in new format)

### Context
D-001 through D-102 were banked using a Context/Decision/Operational/Rationale format that emerged organically. D-103 introduced a richer structured format (Date/Status/Supersedes/Related/Context/Decision/Rationale/Implications/Out of scope) per `docs/_decision_bank.md` template.

### Decision
The new structured format is canonical going forward. Old entries (D-001 through D-102) remain in their original format — not mass-rewritten.

### Rationale
- New format captures decision metadata (status, supersession, scope boundaries) that old format lost
- Mass-rewriting 100+ entries is high-effort, low-value, and risks introducing errors
- Two coexisting formats is acceptable because old format is a complete record of decisions as-banked-then

### Implications
- All future D-numbers use the structured format
- `docs/_decision_bank.md` template is the authoritative format reference
- When an old decision is superseded, the NEW superseding decision uses the new format and references the old one in its "Supersedes" field

### Out of scope
- Mass-rewriting D-001 through D-102
- Format negotiation per-decision (the template is the standard)

---

## D-105: Admin role provisioning — Stage 2.A.1 scope

**Date:** 2026-05-23
**Status:** Locked
**Supersedes:** None
**Related:** K-020 (resolved by this decision), MEMORY.md "SECURITY DEFINER lockdown" principle, MEMORY.md "Frozen columns need provisioning paths" principle

### Context
K-020 surfaced that admin features exist (/admin/verifications, Phase C.5.6) gated by `role = 'admin'`, but no app-level path provisions the first admin. The `profiles_freeze_role` trigger blocks app-level role changes. Manual DB intervention works but Frank explicitly rejected it as ongoing process — admin must function as a product feature, not a SQL recipe.

### Decision

**1. WHEN:** Admin bootstrap built as Stage 2.A.1, inserted between Stage 2.A close and Stage 2.B start. Blocks Stage 2.B kickoff.

**2. HOW first admin gets provisioned:** Designated bootstrap email via environment variable `ADMIN_BOOTSTRAP_EMAIL` (set per environment in `.dev.vars` for local dev, Cloudflare Pages env for production). Bootstrap email for ShowMePrice is `admin@showmeprice.ng`. On any signup or signin where the authenticated user's email matches `ADMIN_BOOTSTRAP_EMAIL` AND their `profiles.role` is not already 'admin', auto-grant admin role via SECURITY DEFINER function. Idempotent — repeated signins by the bootstrap user are no-ops once admin role is set.

**3. HOW subsequent admins get granted:** Admin UI at `/admin/users`, gated by `requireAdmin()`. Server actions `grantAdminAction(targetUserId, reason)` and `revokeAdminAction(targetUserId, reason)` execute via SECURITY DEFINER function with triple-REVOKE lockdown (anon + authenticated + PUBLIC, then GRANT to service_role). Audit logged to new `admin_role_changes` table (append-only). UI and server-side both prevent revoking the last admin (deadlock prevention).

### Rationale
- ENV var approach works across dev/staging/prod without code changes; idempotent and revocable by removing the env var
- `admin@showmeprice.ng` separates "Frank the person" from "ShowMePrice admin" — cleaner mental model, supports future co-founders / staff
- Triple-REVOKE pattern is the banked MEMORY principle from Stage 2.A's E.2.1.1 security fix; reused here
- requireAdmin() is the established Phase C.5.6 pattern
- Audit table provides paper trail without requiring multi-admin sign-off (which would add friction for solo-founder phase without delivering value yet)
- Last-admin-revocation prevention at both UI and server layers (defense-in-depth, established pattern)

### Implications
- New env var `ADMIN_BOOTSTRAP_EMAIL` in `.dev.vars` and Cloudflare Pages
- New SECURITY DEFINER function `grant_admin_role(target_user_id uuid, granter_id uuid, reason text)` with triple-REVOKE
- New SECURITY DEFINER function `revoke_admin_role(target_user_id uuid, granter_id uuid, reason text)` — same lockdown
- New table `admin_role_changes` (id uuid pk, target_user_id uuid fk, granter_id uuid nullable fk for bootstrap (no granter), action text 'granted'|'revoked'|'bootstrap', reason text, created_at timestamptz)
- New helper in /auth/callback or signup action: bootstrap detection logic
- New route `/admin/users` with user list + grant/revoke buttons
- Server actions `grantAdminAction` and `revokeAdminAction` (both gated by requireAdmin())
- K-020 resolved by this commit chain

### Out of scope
- Multi-admin sign-off for grants (deferred; YAGNI for solo-founder phase)
- Admin role expiry / time-bound admin grants (deferred)
- Per-feature admin permissions (just role='admin' for now; granular permissions deferred to Phase F+ if needed)
- Notification emails on admin grant/revoke (deferred — audit table is sufficient for MVP)
- Self-service admin revocation (admins can't revoke themselves; only other admins can revoke them, with last-admin prevention)

---

## D-106: Admin navigation entry point — Stage 2.A.2 scope

**Date:** 2026-05-22
**Status:** Locked
**Supersedes:** None
**Related:** K-024 (resolved by this decision when implemented), D-105 (admin provisioning — scoping miss being addressed)

### Context
D-105 banked the admin provisioning mechanism but did not include a navigation entry point for admin users. Discovered during Stage 2.A.1 smoke test 2026-05-22 — admins can access /admin/verifications and /admin/users only by typing the URL directly. Unacceptable for production launch.

### Decision

**1. WHEN:** Stage 2.A.2, inserted between Stage 2.A.1 close and Stage 2.B start. Blocks Stage 2.B kickoff.

**2. PATTERN:** Single "Admin" link in header, visible only when user.role === 'admin'. Will evolve to dropdown when admin page count exceeds 3.

**3. LANDING:** New `/admin` landing page with cards/links to existing admin features (/admin/verifications, /admin/users). Forces conscious choice rather than auto-routing.

**4. VISUAL TREATMENT:** Minimal for MVP — plain text link in header, no pending counts, no special styling. Polish deferred.

### Rationale
- Production admins won't accept type-the-URL navigation
- Header link is simplest pattern, fast to ship
- /admin landing accommodates future admin features cleanly
- Dropdown evolution path is known and straightforward when needed
- Minimal visual treatment ships sooner; polish can come later if needed

### Implications
- Modification to header component to add admin-only link
- New `src/app/admin/page.tsx` landing page
- Inline admin guard mirroring /admin/verifications and /admin/users pattern
- Card components linking to existing admin pages
- K-024 resolved by implementation

### Out of scope
- Pending count badges on the Admin link
- Special header styling for admins
- Dashboard widget for admin shortcuts (separate concern; possible future enhancement)
- Mobile navigation considerations (TBD with Stage 2.A.2 implementation)
- Migration of /admin/verifications and /admin/users inline guards to shared requireAdmin (still deferred)
