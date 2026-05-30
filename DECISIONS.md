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

---

## D-107: Admin user management — rename /admin/users to /admin/staff, scope to admin/staff only

**Date:** 2026-05-22
**Status:** Locked
**Supersedes:** None
**Related:** D-105 (admin provisioning), D-106 (admin navigation), K-025

### Context
Stage 2.A.1 shipped /admin/users listing ALL users with grant/revoke buttons per row. Post-smoke-test review revealed this doesn't scale: at 1000+ users, 990+ irrelevant grant buttons would clutter the page.

On further analysis, MVP doesn't actually need a general user-directory feature. Admin operations are scoped:
- Business verification reviews happen on /admin/verifications (existing queue)
- Admin role management happens on the page we built tonight
- Casual user browsing has no MVP use case
- Rare user lookup (fraud, support) can use SQL Editor temporarily

The right MVP scope is: rename and refocus the page to admin/staff role management only. No general user directory.

### Decision

**1. RENAME:** `/admin/users` becomes `/admin/staff`. URL change reflects the page's actual purpose. Folder rename in `src/app/admin/users/` → `src/app/admin/staff/`.

**2. SCOPE:** The page lists only users with `role = 'admin'`. Regular sellers/buyers are not displayed in any default list view.

**3. GRANT FLOW:** Single "Grant admin role" button at top of page. Click opens a search dialog. Admin types email (with live debounced search across all users, ~300ms debounce, minimum 3 chars). Admin selects match → reason field (5-500 chars, reusing existing validation) → confirms grant. After grant, new admin appears in the list.

**4. REVOKE FLOW:** Existing revoke pattern preserved (inline expand on row, reason field, confirm). Self-revoke and last-admin protections preserved unchanged.

**5. NO GENERAL USER DIRECTORY:** No browse-all-users feature in MVP. When a future use case emerges (fraud investigation, support tools, etc.), a separate /admin/users-search or /admin/find-user feature gets banked as its own decision.

**6. NAMING CHOICE:** "staff" over "admins" because the page will accommodate future role types (moderator, content-admin, support-agent) without another rename.

### Rationale
- MVP admin operations are scoped; no real user-directory use case yet
- Smaller surface area = less to maintain, faster to ship
- Naming /admin/staff is honest about page purpose
- Search-on-grant pattern handles "find a user to promote" without a full directory
- Future user-directory feature gets proper scoping when its use case is concrete
- The /admin/staff naming accommodates future non-admin staff roles

### Implications
- Rename route from /admin/users to /admin/staff (folder rename)
- Refactor existing page to filter by `role = 'admin'` only (query change in page.tsx)
- Remove grant/revoke buttons from row context; replace row-level grant with header-level "Grant admin" button + search dialog
- Build search-and-select dialog component (reusable for future use cases)
- Existing UserAdminControls.tsx splits: revoke logic stays as row action; grant logic moves to a new SearchAndGrant dialog
- /admin landing page (per D-106) links to /admin/staff (not /admin/users)
- Update K-024 to reflect /admin/staff as the route name when implementing D-106
- Server actions grantAdminAction and revokeAdminAction unchanged (no signature changes)
- Backend search query: server action or API route that joins auth.users (admin client) with profiles, returns paginated matches by email (exact) or name (fuzzy ILIKE)

### Out of scope
- General user directory (browse all users by filters) — defer until concrete use case
- User profile detail pages — defer until needed
- Bulk operations — defer
- Search filters beyond email/name — basic search only
- Visual polish — separate concern, future work
- Admin role types beyond 'admin' (moderator, content-admin, etc.) — defer
- Mobile responsive considerations for search dialog — TBD with implementation
- Pagination on search results — limit to top N matches for MVP

### Scope ordering
- **D-106 (Stage 2.A.2)** ships first: header link + /admin landing page + cards (cards link to /admin/staff per this decision). Single commit, ~30-60 min.
- **D-107 (Stage 2.A.3)** ships second: route rename + scope refactor + search-and-grant dialog. Larger commit chain, ~2-3 hours.
- Both before Stage 2.B (messaging MVP).

---

## D-108: First-message template tracking storage

**Date:** 2026-05-22
**Status:** Locked
**Supersedes:** None
**Related:** D-096 (first-message templates), Stage 2.B messaging MVP

### Context
D-096 requires first-message template usage to be tracked (response-quality + abuse-analysis signal), but no storage location was specified. Options: (A) `messages.metadata.template_id` JSONB field; (B) new `message_templates` table + `messages.template_id` FK column; (C) separate audit table.

### Decision
Track template usage in the existing `messages.metadata` JSONB column (no schema change). Locked shape:
- `metadata.template_id: string | null` — the template identifier when a message used a template; null/absent otherwise.
- `metadata.template_edited: boolean` (optional) — true if the user started from a template then modified the text (quality signal for later).

### Rationale
- `metadata` already exists (NOT NULL DEFAULT `'{}'`); zero schema change.
- Queryable for "which templates are used" at MVP scale.
- Migratable to a dedicated `message_templates` table later if template management grows complex.

### Implications
- The send-message server action sets `metadata.template_id` (and optionally `template_edited`) when a buyer sends from a template.
- This metadata key shape is the contract across the action + future analytics; documented here to prevent drift.
- No migration required.

### Out of scope
- Dedicated template-management table / admin template CRUD (defer until non-trivial).
- Seller quick-reply template tracking (§8) — separate concern.

---

## D-109: Last-seen signal storage (response-time deferred)

**Date:** 2026-05-22
**Status:** Locked
**Supersedes:** None
**Related:** D-100 (presence signals), §8/§16 reply-rate (Phase F+), Stage 2.B

### Context
D-100 ships "last-seen + response-time signals" in the MVP but specified no storage location. Last-seen options: (A) `profiles.last_seen_at` column; (B) computed-on-read from messages; (C) separate `user_presence` table.

### Decision
1. Add `profiles.last_seen_at timestamptz` (nullable) — the persistent last-seen signal (A).
2. **Response-time is NOT stored in this phase.** It is a separate aggregate that overlaps the Phase F+ reply-rate work (§8/§16) and is deferred there; computed-on-read from `messages` is acceptable if a signal is needed before then.
3. `last_seen_at` is updated on exactly three events: **sign-in, opening a conversation, and sending a message.** No every-page-load updates (write amplification on a read-hot table).
4. **Asymmetric visibility:** seller `last_seen_at` is displayed to buyers (trust signal — "seller last active 2h ago"); buyer `last_seen_at` is NOT displayed to sellers in MVP (no clear trust benefit; avoids a surveillance feel). Revisit if product research surfaces value.

### Rationale
- User-scoped signal → `profiles` column is the natural home (not conversation-scoped).
- Cheap UPDATE + indexed SELECT; ephemeral Realtime presence is a separate concern.
- Bundling response-time as a stored column now would collide with the F+ reply-rate design — defer.

### Implications
- A later migration adds `profiles.last_seen_at` (NOT part of the Phase 2 docs commit).
- Drizzle mirror (`src/db/schema/profiles.ts`) + ACTUAL_SCHEMA updated when that migration ships.
- Updating `last_seen_at` fires the `profiles` `set_updated_at` trigger (bumps `updated_at`) — accepted side effect.
- Display layer enforces the asymmetric-visibility rule.

### Out of scope
- Response-time / reply-rate aggregate (Phase F+).
- Realtime/ephemeral presence ("typing", online dot) — deferred per D-095/D-100.
- Buyer-last-seen-visible-to-seller (MVP excludes).

---

## D-110: Messaging safety layer — reuse §10 filter_rules (Interpretation C reconciliation)

**Date:** 2026-05-22
**Status:** Locked
**Supersedes:** None
**Related:** D-097, D-101 (safety layer = warnings in MVP), §10 PII filter, E.2.3.0 migration

### Context
D-101 requires a non-negotiable conversation safety layer; D-097 scopes the MVP to **warnings** (not hard blocks). Phase 1 verification confirmed the §10 `filter_rules` / `filter_actions_log` infra supports per-context targeting (`applies_to_context` jsonb incl. `'message'`) and per-tier targeting, with `filter_actions_log` logging by `context` / `context_id` / `rule_id`. It also revealed 14 seeded rules already exist — several with message-context `action='block'` (WhatsApp/Signal/Telegram links, payment_url, shortened_url), and `email` + `nuban` blocking in BOTH message and listing contexts.

### Decision
Reuse the §10 `filter_rules` / `filter_actions_log` infrastructure (no parallel system). Reconcile the seeded rules to **Interpretation C** for the `message` context:
- **Hard block in messages** (off-platform-handoff / fraud-vector threats): WhatsApp, Signal, Telegram links; `payment_url`; `shortened_url`.
- **Warn in messages** (allow with friction): `email`, `nuban`, `phone`, `social_handle`.
- **Listings unchanged** — `listing_description` retains the existing strict block policy (anti-spam / anti-fraud).

**Tier targeting:** message-context warn rules apply to `tier=['free']` only (Pro exempt). Mirrors the existing `phone` + `social_handle` rules and the §10 Pro-relaxation model.

This requires **splitting the `email` and `nuban` rules per-context** (they currently apply `block` to both): keep `block` for `listing_description`, add a new `warn` rule for `message`. Executed in migration **E.2.3.0**. The link/payment/shortened-url message blocks are already correct and stay as-is.

### Rationale
- Don't duplicate filter infrastructure; §10 already supports typed patterns + per-context action + action logging.
- Interpretation C balances D-101 (keep the worst off-platform-scam vectors hard-blocked even in messages) with D-097 (warn, don't block, for softer PII a buyer may legitimately choose to share).
- Listings are public and a different threat surface; their strict policy is correct and untouched.

### Implications
- E.2.3.0 splits `email` + `nuban` rules per-context (block→listing only; add warn→message).
- The send-message action runs content through the filter scoped to `'message' = ANY(applies_to_context)` (the column is `text[]`, NOT jsonb — confirmed E.2.3.0 §0), logs to `filter_actions_log` (context='message', context_id=message_id), and surfaces warn vs block per the matched rule's action.
- The §10 hard-block-everything-in-messages matrix (spec lines 524-534) is post-MVP / full-feature behavior, NOT current MVP scope.

### Out of scope
- Trust-scoring escalation of contact patterns (deferred per D-097).
- Image OCR safety (`message_image_analysis`, Phase G+).
- Admin UI for editing filter_rules (exists per §10/§14; not part of 2.B).

---

> **Strategic foundation note (D-111 → D-117, 2026-05-22):** these seven decisions come from a full strategic review (master plan v1.2, kept as a Google Doc outside the repo; see `docs/journal/2026-05-22-strategic-foundation.md` for the in-repo summary). They **supersede/refine several earlier monetization + escrow decisions** — cross-references are in each entry's Supersedes/Related fields. Per the append-only rule, the superseded entries (D-082 escrow-timing, D-083, D-084, D-085) are NOT edited in place; their status is governed by the newer entries below. Reference this foundation before any major Phase E architectural decision.

## D-111: Payment architecture — no buyer-seller money intermediation at MVP

**Date:** 2026-05-22
**Status:** Locked
**Supersedes:** the escrow-timing/processor portion of D-082 (escrow no longer "ships Phase E via Paystack")
**Related:** D-086 (escrow fee mechanics — now dormant until a licensed pilot), D-090 (Paystack channels), D-074/D-078 (payment-provider abstraction), Banked Principle 1 (escrow buyer-gated — dormant until escrow returns)

### Context
Paystack (Tomiwa) confirmed they offer no escrow service. This prompted a full payment-architecture review against Nigerian regulatory exposure.

### Decision
ShowMePrice MVP **does not process buyer-seller product payments** — those remain off-platform. ShowMePrice does not hold, settle, release, refund, or guarantee product money at MVP. **Paystack is approved only for platform payments** where the user pays ShowMePrice directly for ShowMePrice services (contact-reveal credits; future Buyer Pro; future seller visibility products). Paystack is **NOT** approved for escrow, Manual Payout, Transfers-API seller settlement, or Transaction Splits for buyer-seller product transactions at MVP. Protected Payment remains a **future pilot requiring a licensed hold/release/refund partner** (Vesicash, EscrowLock, or similar).

### Rationale
Avoids BOFIA 2020 + CBN regulatory risk (holding/settling third-party funds without a licence) while preserving optionality for a future licensed-partner pilot.

### Implications
- Paystack onboarding direction: **standard merchant** (platform fees only), awaiting KYB requirements.
- The empty escrow scaffolding (`orders`, `escrow_transactions`, `escrow_orders`) and `compute_escrow_fee()` stay **dormant** at MVP — not removed.
- **Spec drift to reconcile (not this commit):** `PHASE_E_SPEC.md §1.5` + `MONETIZATION-PLAN.md` still frame escrow as Phase E — superseded by this decision; needs a future spec pass.

### Out of scope
- Protected Payment pilot design (future, licensed partner).
- Removing the dormant escrow tables/function (kept for the future pilot).

---

## D-112: Trust-first positioning with operationalized verification

**Date:** 2026-05-22
**Status:** Locked
**Supersedes:** None
**Related:** D-102 (marketing precision), D-032 (hard verification gate), D-030 (verified badge), Banked Principles 2 & 5

### Context
Positioning must be a structural differentiator, not a slogan — and must never overclaim.

### Decision
ShowMePrice competes on **trust integrity, not listing volume.** Four structural differentiators, each operationally enforced: (1) **real prices required** on every listing (form validation); (2) **multi-level verification with honest labels** — Phone Verified / Identity Reviewed / Business Verified — never "verified = safe"; (3) **logged contact reveal** with anti-harvesting controls; (4) **active fraud prevention** (rule-based detection + admin review queue). Tagline: **"Real prices. Verified sellers. Safer deals."** Marketing constraints LOCKED: NEVER claim guarantees / refunds / held money / "verified = safe"; ALWAYS state what verification actually means at each level.

### Rationale
Differentiates from Jiji-style volume marketplaces; honest labels protect the brand and limit liability (consistent with D-102 + Principle 2).

### Implications
- Stage 2.C (trust visibility) surfaces per-level badges + a trust box + "what's checked" copy.
- "Safer deals" (comparative) — never "safe" (absolute) — in all copy.

### Out of scope
- Specific badge visual design (Stage 2.C).

---

## D-113: Monetization phasing with anti-abuse coupling

**Date:** 2026-05-22
**Status:** Locked
**Supersedes:** D-084 (signup free-reveal count: "1 at signup" → configurable 3/2/2 after phone verification); D-085 (credit-pack structure + pricing: 4-tier trial/small/medium/large → 3-tier 1/5/15; 50-reveal pack deferred to anti-harvesting maturity)
**Related:** D-083 (reveal caps — refined below), D-087 (Buyer Pro launch promo — deferred, not superseded), D-111 (platform-payments-only)

### Context
Monetization must be phased and coupled to anti-abuse, not switched on at launch.

### Decision
- **Private beta (Months 3-4):** no monetization. Free reveals (default **3**/buyer), manual moderation, no Paystack.
- **Public beta + launch (Months 5+):** configurable free reveals after phone verification. Paid reveal credits via Paystack — **1 / 5 / 15 packs at ₦300 / ₦1,200 / ₦3,000.** No 50-pack at launch (anti-harvesting). Hard caps even for paid users: **20/day, 60-second cooldown.**
- **Default free reveal counts (configurable per stage):** private beta 3 · public beta 2 · public launch 2 (tunable to 1 if abuse warrants).
- **Future phases, traction-triggered (not calendar):** Buyer Pro (with a monthly cap, not unlimited), category listing fees (property/vehicles/generators), listing boosts + Seller Pro, advertising, optional escrow via licensed partner (per D-111).

### Rationale
Learn abuse patterns free during private beta; introduce paid credits only once anti-abuse infra exists; caps prevent contact-harvesting (the core marketplace abuse vector).

### Implications (reconciliation work, NOT this commit)
- Deployed `profiles.signup_free_reveals_remaining` DEFAULT `1` is now **stale** (→ configurable 3/2/2).
- Deployed `credit_pack_type` enum (`trial`/`small`/`medium`/`large`) + `payments.pack_type` CHECK **mismatch** the new 1/5/15 packs.
- **D-083 interaction:** the universal **20/day** anti-harvesting cap takes precedence; D-083's tier-based caps apply *within* that ceiling once Buyer Pro ships — new Pro 10/day, established Pro **20/day (capped down from D-083's 25)**. `get_buyer_reveal_cap()` reworked accordingly, plus the 60s cooldown.
- All thresholds must be configurable (see D-114), not hardcoded.

### Out of scope
- Buyer Pro / Seller Pro / boosts / ads pricing (future, traction-triggered).

---

## D-114: Anti-abuse operating policy + signup/identity model

**Date:** 2026-05-22
**Status:** Locked
**Supersedes:** None outright
**Related:** Refines D-022 + D-040 (signup model); D-009 + D-055 (phone format/normalization); D-110 (messaging filter); **Resolves K-019** (international phone policy — recommend moving K-019 → Resolved in a KNOWN_ISSUES follow-up)

### Context
Every trust claim needs an operational enforcement mechanism, and the signup/identity model needs to support flexible onboarding while keeping phone as the identity gate.

### Decision
**Detection is rule-based at MVP** (no ML); every flag explainable to admin; reports create review *priority*, not auto-suspension; hard auto-actions only on severe, clearly-defined triggers.

**Signup flexibility:** sign up with EITHER email OR phone. **Phone OTP is the identity gate REQUIRED before any trust-sensitive action** (messaging, offers, reveals, reports), regardless of signup path. Email optional when phone-first (recommended for recovery, with honest copy); email required when email-first. Missing credential can be added later.
**Identity hierarchy:** phone = primary gate; email = secondary infra (recovery, receipts, notifications).
**Phone uniqueness:** one phone = one account; normalized before storage (`+234` ≡ `0` prefix); banned numbers cannot be reused.
**International phone:** any valid international phone can verify. `+234` verified buyers get automatic free reveals; non-`+234` verified buyers can browse/message but free reveals require admin approval during beta.

**Buyer rules (action):** 5+ reveals/1h → throttle to 1/5min for 24h · 10+ reveals/24h **with other signals** → admin review (reveal-without-message alone is NOT abuse — many NG buyers prefer calls) · 2 sellers report same buyer → soft flag · 3 sellers/7d → hard flag (message-restricted) · WhatsApp/Signal/Telegram + payment URLs → blocked (D-110) + admin notified · IP rate limits (3 signups/IP/24h) = **risk signal, not hard block** (shared NG IPs) · account-age-before-first-reveal: 0min private / 10min public beta / 10-30min launch (configurable) · reveal cooldown 60s (configurable).
**Seller rules:** price <30% category median → soft flag · 3+ listings/1h → soft flag · 2 buyer reports/14d → soft flag · 3 buyer reports/14d → hard flag (listings paused) · 3+ contact-detail changes/30d → soft flag.
**Escalation:** soft flag → hard flag (activity paused) → admin decision (approve/restrict/suspend/ban/dismiss) → permanent ban (phone/IP/document blocklist).
**Account states (progressive):** active / limited / under_review / suspended / banned.
**Coordinated-abuse defense:** admin reviews shared patterns (phone, IP, photos, contacts, listing language); **no automated suspension on report count alone.**
**Configurability principle:** all thresholds (free-reveal counts, cooldowns, age delays, rate limits) stored as configurable settings (`app_settings`/feature-flags), **never hardcoded.**

### Rationale
Nigerian-market realities (shared IPs, call-first buyers) mean naive hard blocks produce false positives; rule-based + admin-review keeps enforcement explainable and tunable.

### Implications (future engineering, NOT this commit)
- New tables eventually: `contact_reveals`, `buyer_reveal_credits`, `reports`, `blocks`, `admin_actions`, `otp_attempts`, `account_status_history`, `risk_events`, `listing_moderation_events`, `app_settings`.
- New profile fields eventually: `phone_normalized`, `account_status`, `verification_level`, `free_reveals_used`, `paid_reveals_balance`, `signup_ip_hash`, `last_ip_hash`, `report_count`, `block_count`.
- `app_settings` table (do NOT create now — future Stage 2.D-light work).

### Out of scope
- Advanced anti-abuse (browser fingerprinting, reverse image search, cross-account graph analysis, ML) — deferred post-beta unless patterns force it earlier.

---

## D-115: Launch sequencing and scope control

**Date:** 2026-05-22
**Status:** Locked
**Supersedes:** None (launch sequencing not previously banked)
**Related:** D-113 (monetization phasing), D-117 (privacy — required before public beta)

### Context
A single public launch risks shipping unproven trust/anti-abuse claims at scale.

### Decision
Three-phase rollout (NOT public-first):
- **Private Beta (Months 3-4):** invite-only (50-100 users), Frank manually moderates, NO Paystack, NO paid reveals (all free), limited categories matched to verification readiness. Goal: validate trust positioning, learn real abuse patterns, build supply, test verification at small scale.
- **Public Beta (Months 5-6):** open signup (500-2,000), ships Stage 2.D-light anti-abuse + Stage 2.E (reporting) + Stage 2.F (reveal credits) + Stage 3.A (Paystack). **D-117 (privacy) must be fully specified before this stage.** Goal: validate monetization willingness + anti-abuse under load.
- **Public Launch (Months 7-9):** full marketing, systems stable, revenue flowing, press/influencer outreach. Goal: 5,000+ users.

### Rationale
Each phase de-risks the next; abuse patterns and monetization willingness are learned at increasing scale before marketing spend.

### Implications
- Advanced anti-abuse is a post-beta enhancement unless beta patterns force it earlier.
- Engineering stages map to phases (see journal).

### Out of scope
- Marketing/press specifics (Public Launch planning).

---

## D-116: Tiered listing access (verification level × category risk)

**Date:** 2026-05-22
**Status:** Locked
**Supersedes:** None
**Related:** Refines D-091 (Phase E "unlimited listings" → per-level caps); D-032 (verification gate); D-042 (taxonomy); D-112 (honest verification labels); the current `isLaunchCategory` allowlist (code)

### Context
Listing permission should scale with how much the seller has been verified and how risky the category is.

### Decision
- **Level 1 — Phone Verified (supply growth):** publish ONLY books, small household items, low-value accessories, fashion < ₦20,000. Cannot publish phones/laptops/electronics/vehicles/property/generators/major appliances or anything > ₦20,000. **Max 2 active listings.**
- **Level 2 — Identity Reviewed (standard):** MVP accepts NIN / voter card / Nigerian driver's licence / Nigerian international passport. Publish phones/laptops/electronics/appliances/fashion/beauty/baby/standard household. Cannot publish vehicles/property/generators/business-scale. **Max 5.** (MVP requires Nigerian government ID; international seller verification deferred post-launch.)
- **Level 3 — Business Verified (full):** CAC document checked against CAC public search / reliable business evidence where available. Publish all categories incl. vehicles/property/generators/business-scale. **Max 20.**
- Every listing must display the seller's verification level via a **visible badge.** Marketing: "sellers verified at multiple levels — every listing shows what's checked," never implying levels are equivalent.

### Rationale
Lets low-friction Level-1 sellers grow supply in low-risk categories while gating high-value/high-fraud categories behind stronger verification — directly operationalizes D-112's honest-labels differentiator.

### Implications (future engineering, NOT this commit)
- Introduces a **3-level `verification_level`** model — distinct from the current binary `businesses.verification_status`.
- Refines D-091: the `businesses.seller_listing_limit` column **stays nullable** (schema unchanged); the **2/5/20 caps are enforced as business rules** by verification level (L1=2, L2=5, L3=20).
- Reshapes the current `isLaunchCategory` allowlist into level×category gating.
- Stage 4 (tiered listing access) work.

### Out of scope
- International seller verification (post-launch).
- Per-category fee logic (D-113 future phase).

---

## D-117: Data protection & privacy operating policy (PLACEHOLDER)

**Date:** 2026-05-22
**Status:** PLACEHOLDER — full specification required before public beta (est. Months 4-5)
**Supersedes:** None
**Related:** D-116 (ID/selfie/CAC capture), D-114 (PII: phone/IP), K-009 (banking-placeholder PII), D-031 (NDPR posture)

### Context
ID documents, selfies, CAC documents, phone numbers, and IP hashes are sensitive PII. A privacy/data-protection policy is critical and must not be forgotten — logged tonight as a placeholder to reserve the decision.

### Scope (to be fully specified before public beta)
ID/selfie/CAC storage (private/encrypted), access controls, **admin access to documents must be logged**, retention/deletion + right-to-erasure mechanism, privacy policy (required before public launch), data minimization, breach response, **NDPR** compliance, **GDPR** considerations for diaspora users.

### Status
Acknowledged as critical; detailed policy drafted + banked before public beta. **D-115 gates public beta on this being fully specified.**

---

## D-118: Referral & word-of-mouth growth policy (PLACEHOLDER)

**Date:** 2026-05-22
**Status:** PLACEHOLDER — full specification required before public beta
**Supersedes:** None
**Related:** D-112 (referrals operationalize trust-first positioning), D-114 (referral mechanics must not create abuse vectors), D-117 (referral data must respect the privacy policy), D-115 (phasing)

### Context
ShowMePrice's growth depends primarily on **trust-driven word-of-mouth**, not paid marketing — the most credible trust signal in the Nigerian context. A formal referral mechanism will be designed to amplify this without creating abuse vectors. Logged tonight as a placeholder to reserve the decision.

### Private beta application
Private-beta invitations are themselves a form of structured referral: Frank invites trusted contacts; those contacts may suggest others for invitation, subject to Frank's review.

### Scope (to be fully specified before public beta)
- Referral reward structure (free credits / premium time / badge — TBD).
- Anti-abuse protections (referrer/referee verification, attribution timing, fraud detection) — must not contradict D-114.
- Reward economics (CPA vs LTV) — sustainable for a solo founder.
- Integration with verification levels (only verified users can refer / be rewarded).
- Direction (sellers refer buyers, buyers refer buyers, or both).
- Attribution mechanics (cookies, codes, link-based).

### Status
Acknowledged as a critical growth lever. Detailed policy drafted + banked before public beta. Must align with D-112 (trust-first), D-114 (anti-abuse), and D-117 (privacy).

---

## D-113 Clarification: free-reveal mechanics (lifetime grant at phone verification, app_settings configurable)

**Date:** 2026-05-23
**Status:** Locked — refinement of D-113, not a new decision
**Supersedes:** None (clarifies D-113)
**Related:** D-113 (monetization phasing), D-114 (anti-abuse + configurable thresholds), D-119 (filter blocks NUBAN/phone in chat — which makes the reveal credit the controlled path)

### Clarification
D-113 banked the **per-stage default counts (3 / 2 / 2)** without explicitly stating the grant mechanics. This clarification fills the gap:

1. **Free reveals are LIFETIME, not renewable.** Once consumed, a buyer must purchase a paid credit pack (D-113: 1 / 5 / 15 packs at ₦300 / ₦1,200 / ₦3,000). No daily/monthly refill of the free allotment.
2. **Granted at phone verification completion**, not at signup. An unverified buyer has zero reveals. The grant is one-shot at the moment `verification_status` gains `phone_verified` — the same hook that runs the D-114 international-vs-`+234` policy split for non-`+234` buyers.
3. **Stage-configurable via `app_settings` table** (or equivalent runtime config store). The 3/2/2 defaults are not hardcoded in code or migrations — they're read from config at grant time so the count can be tuned (D-113 spec line: "tunable to 1 if abuse warrants") without a deploy.

### Why now
Surfaced during Stage 2.B Commit 1 smoke testing of the D-110 messaging filter (adversarial review). The filter blocks NUBAN + Nigerian phone numbers in chat (D-119), which forces buyers to use the contact-reveal credit system to obtain seller contact — making the reveal-credit mechanics load-bearing for the D-112 trust hierarchy. The lifetime-grant clarification was implicit in D-113's anti-harvesting framing but not written down; tonight closes that gap before any reveal-credit code lands.

### Implications (future engineering, NOT this commit)
- `app_settings` table (or chosen runtime config equivalent) must exist before the reveal-credit action ships. Tracked as Phase E follow-up.
- The grant trigger fires inside the phone-verification completion path (`mark_phone_verified` function or its caller — TBD per implementation).
- D-114's "international (non-`+234`) free reveals require admin approval during beta" still applies — the grant trigger short-circuits for non-`+234` buyers and queues admin approval instead.

---

## D-119: D-110 Filter System Expansion — Nigerian-specific pattern coverage

**Date:** 2026-05-23
**Status:** Locked
**Supersedes:** None (extends D-110)
**Related:** D-110 (filter rules), D-112 (trust positioning), D-113 (contact reveal as the controlled phone-access path), D-114 (anti-abuse), D-120 (registered payment details — the controlled path that NUBAN chat-block forces users into), K-029 (NUBAN price-context whitelist), K-033 / K-036 (deferred filter work)

### Context
Adversarial smoke testing of Stage 2.B Commit 1 surfaced trivial bypass patterns of the existing D-110 filter: raw Nigerian phone number formats (`080…`, `+234…`, `234…`, spaced/dashed/dotted), WhatsApp domain typo variants (`we.me`, `w-a.me`, `whatsap.me`), telegram references without explicit links, bank platform name references, payment platform links (Paystack/Flutterwave/Monnify/Opay), shortened URLs (bit.ly / tinyurl / t.co / etc.). These bypasses directly contradict D-112's trust positioning. UI commits cannot ship trust signals on top of a weak filter foundation.

### Decision (policy)
- **Nigerian phone numbers (any format)** — BLOCK strictly. Buyers must use the contact-reveal credit system for seller phone access (D-113 monetization + accountability).
- **NUBAN bank accounts (10 digits)** — BLOCK in chat. K-029 price-context whitelist preserved. Sellers share payment details via the D-120 controlled flow, not free-text chat.
- **Off-platform handoff language** — WARN in messages (BLOCK at listing level when listing-context enforcement ships per K-036).
- **Email addresses** — WARN in messages (BLOCK at listing level per K-036).
- **Social handles** — WARN in messages (BLOCK at listing level per K-036).
- **WhatsApp typo variants** — BLOCK (extends existing rule).
- **Telegram + Signal references** — BLOCK (not WARN — too risky for MVP).
- **Payment links** (Paystack, Flutterwave, Monnify, Opay, crypto, unknown payment URLs) — BLOCK.
- **Shortened URLs** (bit.ly, tinyurl, t.co, cutt.ly, rebrand.ly, shorturl.at, is.gd, ow.ly) — BLOCK (anti-phishing).
- **General payment language** (cash, transfer, delivery) — ALLOW.
- **Price-looking numbers with price context** — ALLOW (K-029 whitelist preserved).

### Listing-level vs message-level
Listings are public, permanent, scalable bypass vectors. Stricter enforcement at the listing level (BLOCK email/social/handoff language that are WARN in messages). **Deferred to K-036** because the current listing CREATE/EDIT actions do not invoke `runMessageFilter` — listing-context rules would land as data with no enforcement path. K-036 captures the code-and-data work to wire listing actions through the filter.

### Warning behavior
WARN actions surface a user-facing warning **at every send** (not dismissed after first acceptance), mark `messages.metadata.contains_warning` permanently, log to `filter_actions_log`, and increment the user's repeat-violation counter for escalation tracking (D-114).

### Implementation phases
- **Phase 1 (this commit, 1.6):** data-driven `filter_rules` additions + vitest expansion. No code changes to `runMessageFilter` — existing architecture supports unlimited rule additions. Message context only (listing context deferred to K-036).
- **Phase 2 (pre-public-beta, K-033):** normalization pipeline — Unicode NFC, number-to-digit conversion ("zero eight zero two…" obfuscation), lookalike substitution, whitespace/case normalization.
- **Phase 3 (post-private-beta, K-033):** heuristic risk scoring for ambiguous cases.
- **Phase 4 (Year 2+, K-033):** ML classification trained on real message corpus.

### User-facing copy (block)
- Phone numbers: *"For safety, phone numbers can't be shared in chat. Use contact reveal so access is logged and both sides stay protected."*
- Bank accounts: *"For safety, bank account numbers can't be shared in chat. The seller can share verified payment details when you've agreed on the deal."*
- Payment links: *"Payment links aren't allowed in ShowMePrice messages. ShowMePrice doesn't process product payments at MVP."*
- Shortened URLs: *"Shortened links aren't allowed. Please share the full URL."*
- Telegram/Signal: *"Links to Telegram or Signal aren't allowed — keep the conversation on ShowMePrice so there's a record."*

### User-facing copy (warn — shown at every send)
- Email: *"Email addresses may move the conversation outside ShowMePrice. Continue only if necessary."*
- Social handles: *"Social handles can move the conversation outside ShowMePrice. For safety, keep key details in chat."*
- Off-platform language: *"Moving off-platform reduces your protection. Keep important details in ShowMePrice chat where possible."*

### Out of scope (this commit)
- Number-as-words and lookalike normalization (K-033 Phase 2 — placeholder `it.skip()` vitest cases).
- Listing-context enforcement (K-036).
- Risk scoring / ML classification (K-033 Phase 3/4).

---

## D-120: Registered Payment Details — seller-initiated, per-conversation sharing

**Date:** 2026-05-23
**Status:** Locked
**Supersedes:** None
**Related:** D-110 (filter rules — NUBAN block creates demand for this controlled path), D-112 (trust positioning), D-113 (contact reveal — prerequisite for payment-details share), D-114 (anti-abuse), D-116 (verification levels), D-119 (filter expansion — same commit), K-009 (legacy seller_verifications banking placeholders — superseded by this), K-034 (Verified Payment Details upgrade, post-beta), K-035 (change cooldown, post-beta)

### Context
D-119 blocks NUBAN account numbers in chat. Sellers still need a way to share payment information with serious buyers. The controlled path: a seller-initiated, per-conversation share mechanism that gates payment details behind the D-112 trust hierarchy and is auditable, encrypted at rest, and per-buyer scoped.

### Architecture
- **Sellers register ONE payment account** in their profile (bank name, account number, account name).
- Account number stored **encrypted at rest** (AES-256-GCM via Web Crypto API, key in Cloudflare Pages env var `PAYMENT_DETAILS_ENCRYPTION_KEY`). **Web Crypto API, not Node `crypto`** — Cloudflare Edge runtime (D-019) does not provide Node built-ins.
- Sellers wear a visible label **"Payment Details Registered"** (NOT "Verified" — verification upgrade is post-beta per K-034).
- Payment details are **NEVER visible to anyone by default** — including buyers in active conversations with the seller.
- Seller clicks **"Share payment details"** in a specific conversation to grant access to that one buyer in that one conversation.
- **Prerequisite:** buyer must have revealed the seller's contact (via D-113 reveal credit) BEFORE the seller can share payment details. Maintains trust hierarchy: browse → message → reveal contact → share payment details.
- Sharing is **FREE** for sellers at MVP (no credit cost). Post-traction monetization: pay-per-share credit OR included in Seller Pro/Premium plan.
- Each share creates a `payment_detail_shares` row with a **snapshot of the account at share time** (ciphertext copied verbatim — no decrypt/re-encrypt cycle; snapshots stay encrypted at rest).
- Buyer sees a mandatory **warning modal** before viewing the account: *"ShowMePrice doesn't hold funds or guarantee delivery. Pay only after inspection or when comfortable."*
- Buyer view UI in conversation BEFORE share: placeholder text *"Payment details will appear here when seller shares them"*.
- **Re-share allowed:** if the seller updates their registered account, the next share supersedes the previous (sets `superseded_at` on the old row); buyer sees a warning on next view: *"⚠️ Seller has updated payment details — verify before paying."*

### Storage
- **`seller_payout_accounts`** table (NEW). One active row per seller (UNIQUE on `seller_id`). Closes K-009 (the legacy `seller_verifications.bank_*` placeholders) by separating payout from identity verification. Columns: `id`, `seller_id` (PK FK profiles), `business_id` (NULLABLE FK businesses — informational only at MVP), `bank_name`, `account_number_encrypted`, `account_name`, `registered_at`, `last_changed_at`.
- **`payment_detail_shares`** table (NEW). One row per share event. Columns: `id`, `conversation_id`, `seller_id`, `buyer_id`, `account_snapshot` (JSONB containing `{bank_name, account_name, account_number_encrypted}` — ciphertext verbatim), `shared_at`, `buyer_viewed_at`, `buyer_warning_accepted_at`, `superseded_at`.

### Keying rationale (`seller_payout_accounts` is profile-keyed)
Most ShowMePrice sellers at MVP do not have business records (D-116 Level 1 Phone Verified and Level 2 Identity Reviewed sellers are profile-only — only Level 3 Business Verified sellers have a `businesses` row). Keying on `seller_id` with an optional `business_id` link supports all seller levels at MVP and provides a clean upgrade path when a Level 1/2 seller later becomes Level 3 (the existing row gets its `business_id` populated; no data migration). Polymorphic owner (`owner_type` + `owner_id`) was rejected as overkill for a single seller-level upgrade path.

### Verification level hierarchy
- **L1: Phone Verified** (basic trust) — D-116.
- **L2: Seller Verified** (identity/business reviewed) — D-116.
- **L3: Payment Details Registered** (seller has set up account) — this decision.
- **L4: Payment Details Verified** (name-matched via Paystack Account Name Inquiry + admin review) — **POST-BETA via K-034.**

### Anti-abuse
- Per-conversation share scope prevents mass-harvesting (each share is scoped to one buyer in one conversation).
- Encryption at rest protects against DB breach exposure.
- Reveal logs in `payment_detail_shares` accumulate for admin review of abuse patterns.
- **K-035** (post-beta): 14-day cooldown after account changes; explicit warnings to prior buyers on the next view.

### Server actions (`src/lib/payment-details/actions.ts`)
- `setSellerPaymentDetails(bankName, accountNumber, accountName)` — UPSERT into `seller_payout_accounts` for the calling seller. Encrypts `accountNumber` before write. Sets `registered_at` on first insert; `last_changed_at` on update.
- `sharePaymentDetailsWithBuyer(conversationId)` — seller-only; must be the seller in the conversation. Verifies seller has registered payment details (else `PaymentDetailsNotRegistered`). Verifies buyer has revealed seller's contact via `contact_reveals` (else `ContactRevealRequired`). Marks any existing non-superseded share for this conversation as superseded, then inserts a new share row with the current encrypted snapshot.
- `getPaymentDetailsForConversation(conversationId)` — buyer-only; must be the buyer in the conversation. Returns the active (non-superseded) share decrypted, or `{ hasShare: false }`.
- `markPaymentDetailsViewed(shareId)` — buyer-only; sets `buyer_viewed_at`.
- `acceptPaymentDetailsWarning(shareId)` — buyer-only; sets `buyer_warning_accepted_at`.

### Future monetization (post-traction, not this commit)
- Free for sellers at MVP to maximize adoption.
- Post-traction: pay-per-share credit OR Seller Pro/Premium subscription includes unlimited shares.

### Out of scope (this commit)
- Verified Payment Details (L4) — Paystack Account Name Inquiry + admin review (K-034).
- Change cooldown (K-035).
- All UI work — Commits 2-7 will surface registration form, share button, buyer view, warning modal, supersession warning.

### UI work (deferred to Commits 2-7)
- Seller profile section for entering/updating payment details (Commit 2 or later).
- Conversation thread integration for seller's "Share payment details" button (Commit 3 or 4).
- Buyer view of placeholder text BEFORE share (Commit 3).
- Buyer view of revealed account AFTER share + mandatory warning modal (Commit 3).
- Supersession warning on re-share (Commit 3).

---

## D-121: Product Quality Standard — World-Class UX/UI

**Date:** 2026-05-23
**Status:** Locked
**Supersedes:** None
**Related:** D-112 (trust-first marketplace positioning), D-117 (privacy placeholder), K-040 (unread-presence dot), K-041 (read receipts), K-042 (split-pane layout)

### Decision
ShowMePrice ships at world-class UX/UI standard from launch. No commits ship UX/UI shortcuts that would create rework. "Polish later" is not an acceptable framing when the standard is clear.

### Context
ShowMePrice competes directly with Jiji, Facebook Marketplace, and WhatsApp commerce in Nigeria. Users compare ShowMePrice against established platforms that have spent years polishing their UX. Any amateur-feeling surface — truncated breadcrumbs, non-sticky composers, missing standard chat patterns, inconsistent spacing — directly signals "this is a smaller, less serious platform" to users who have alternatives.

### Implementation discipline
- Surface findings for every commit must include UX/UI quality as a first-class consideration, not deferred to polish commits.
- Default to "standard professional pattern from mature competitor" unless there's specific reason to deviate.
- Agent surface findings should evaluate each design decision against: would this look right at WhatsApp Web / Jiji / Facebook Marketplace?
- When in doubt, ship the more polished option even if it costs more LOC or time.
- Polish passes (when needed) happen during the same commit that builds the feature, not in a separate later commit.

### Trade-off explicitly accepted
- Slower per-commit shipping pace.
- Larger commits.
- More agent hours per feature.
- Worth it because: quality compounds in user trust, sloppy UX compounds in user churn.

### What this does NOT mean
- Over-engineering features that aren't shipped yet.
- Adding scope unrelated to the commit's intent.
- Refactoring stable shipped code just for aesthetics.
- Indefinite polish loops.

### Operational impact
- All future agent surface findings must include explicit UX quality evaluation.
- All future commit messages should reference D-121 where polish was prioritized.
- K-issues that represent UX shortcuts should be prioritized over functional-only K-issues at equal stage.
- Stage planning should budget for UX time as first-class scope, not optional.

---

## D-121 Reaffirmation (Frank's directive, 2026-05-23)

**Status:** Locked. Operational mandate, not principle-statement.

> *"From now onward, I want ShowMePrice to be outstandingly world-class professional UX and UI. As you know, we have competitors in Nigeria. I do not want ShowMePrice to be a less-value product at launch. I want ShowMePrice to be a professional and world-class marketplace for Nigerians."*
> — Frank, 2026-05-23

This reaffirmation strengthens D-121 from "default to the more polished option" into a **launch-prerequisite quality bar**. The operational reading agents must carry into every surface findings + commit going forward:

### What this means in agent practice
- **No shortcut surfaces.** If a finding can be shipped cleanly OR can be shipped "quick and patched later," ship clean. Polish K-issues are for genuine future-work scope, not for things that should ship right.
- **Default to "what would WhatsApp / Jumia / Konga / Jiji ship?"** — but only as a floor. Where ShowMePrice can be MORE polished than the competition (trust-positioning, copy precision, density, spacing rigor, micro-interactions), it should be.
- **Quality is non-negotiable at launch.** Slower per-commit pace is the accepted trade. Larger commits, more agent hours per feature, more surface-findings rounds — all fine. Cutting quality is not fine.
- **Compare against the strongest competitor for each surface, not the weakest.** Jiji is the volume comparison; Konga is the verified-seller comparison; Facebook Marketplace is the trust-feel comparison; WhatsApp is the messaging comparison. ShowMePrice's surfaces must read as peers of those, not as a smaller alternative.
- **Trust signals (D-112) are the differentiator.** Where competitors are sloppy on trust (Jiji's scam reputation, WhatsApp's no-verification), ShowMePrice shows the gap visually — clear verification badges, prominent last-active, honest filter copy, no dark patterns.
- **Nigerian context, world-class execution.** The market is Nigerian; the quality bar is global. NGN-only, WhatsApp-native, mobile-first — but rendered to the standard of products competing for paying customers in any market.

### Operational impact (in addition to D-121's existing clauses)
- Agents producing surface findings: lead with "what does world-class look like here?" before listing options. Default-toward-polished even when not explicitly asked.
- Commits whose primary value is correctness (server actions, migrations, infra) still apply the bar to any user-facing surface they touch.
- Frank reserves the right to push back on any surface that reads as less-than-world-class and require it to be redone — this is not scope-creep, this is the contract.
- "Polish-later" K-issues remain valid ONLY for items that are (a) genuinely out of current commit's scope AND (b) won't be visible to users at launch in a less-than-polished state. If a polish item would be VISIBLE and SLOPPY at launch, it ships now.

### What this does NOT change from D-121
- Out-of-scope features stay deferred.
- K-issues remain a valid tool for future-work tracking.
- No indefinite polish loops on already-shipped clean code.
- Build gate, surface-findings-then-approval discipline, and commit-by-commit cadence all unchanged.

**Mental anchor for the agent:** Frank will be showing ShowMePrice to Nigerian buyers and sellers who already use Jumia, Konga, Jiji, Facebook Marketplace, and WhatsApp. The user's first 60 seconds on the site decides whether they take ShowMePrice seriously. Every surface must earn that 60 seconds.

---

## D-122: Advertising Posture — Marketplace-native promotion only

**Date:** 2026-05-23
**Status:** Locked
**Supersedes:** None
**Related:** D-112 (trust-first positioning), D-113 (contact reveal credits — primary revenue), D-123 (promotion architecture), D-123b (activation triggers)

### Decision
ShowMePrice does NOT show third-party display ads (AdSense, Meta Audience Network, banner ad networks). Revenue from advertising-style surfaces comes only from marketplace-native promotion.

### Allowed monetization surfaces
- **Promoted Listings** — sellers pay to boost their own verified listings.
- **Sponsored merchant placements** — verified businesses in relevant categories (post-traction).
- **Cross-promotion** of ShowMePrice features and subscriptions.
- **Category sponsorship** — verified merchants funding category-wide visibility (post-traction).

### Reasoning
D-112 trust-first positioning is undermined by third-party display ads. Marketplace-native promotion aligns platform incentives with user trust — the platform earns when sellers transact, not when buyers see ads. Mature marketplaces (eBay, Amazon, Facebook Marketplace) monetize through promoted listings, not banner inventory.

### Forbidden in any commit or feature
- AdSense, Meta Audience Network, or similar third-party ad network integration.
- Affiliate link injection in user content.
- Popup, interstitial, or autoplay ad surfaces.
- Cross-platform ad tracking from third-party networks (Facebook Pixel, Google Ads remarketing, etc.) — exception: ShowMePrice's own marketing campaigns using these networks for outbound acquisition is fine; the prohibition is on EMBEDDING third-party tracking into the product surface.

---

## D-123: Marketplace Promotion Architecture

**Date:** 2026-05-23
**Status:** Locked
**Supersedes:** None
**Related:** D-122 (advertising posture), D-123b (activation triggers), D-112 (trust-first positioning), D-113 (contact reveal credits — primary revenue)

### Decision
ShowMePrice's promotion model is trust-weighted, not pay-to-win.

### Core principles
- **ADDITIVE boost weight within trust tier, never multiplicative across tiers** — paying sellers move up among their peers, never above substantially more trusted sellers.
- **VERIFIED-ONLY boost eligibility** — verification is a prerequisite to boost, not an outcome of paying.
- **DENSITY-CAPPED** — maximum 20% of any category/search results page is promoted; organic results dominate.
- **VISIBLY LABELED** — all boosted listings show a "Featured" or "Promoted" indicator (transparency to buyers).
- **FIXED PRICING** — no auctions or dynamic pricing at MVP; seller predictability matters.

### MVP scope (infrastructure only, NOT monetization activation)
- Listings table boost columns (`boost_until`, `boost_tier`).
- Marketplace search/sort respects boost priority WITHIN trust tier.
- Category pages render "Featured" section distinct from organic.
- Boost transactions flow through the standard Paystack merchant flow.
- Operational infrastructure: refund policy for suspended boosts, admin disable-on-violation flow, listing-edit-revokes-boost rule, boost-end cron.

### Post-MVP roadmap (in order)
1. **Featured Listings** (single tier, ₦TBD per 3 days).
2. **Search Boosts** (boost visibility for a specific category for X days).
3. **Seller Spotlight** ("Trusted Sellers in Lagos" featured carousels).
4. **Category Sponsorship** ("Verified Laptop Week").
5. **Response-rate-as-boost-eligibility** (sellers with low reply rate lose boost privilege).
6. **Boost-effectiveness analytics dashboard** for sellers (ROI visibility).

### Cautions (banked for future awareness)
- "Featured" labels reduce boost effectiveness for label-aware buyers; price boosts accordingly.
- Verified sellers may not be the highest-paying boost cohort; revenue may concentrate in less-trust-conscious-but-verified sellers.
- Do NOT publicly position as "trust-ranked marketplace" until ranking data validates the claim.

### Out of scope at any stage
- Pay-to-win ranking (boost overriding trust).
- Hidden promotions (all boosts visibly labeled).
- Boost auctions or dynamic pricing.

---

## D-123b: Promotion Activation Trigger

**Date:** 2026-05-23
**Status:** Locked — clarifies D-123 activation conditions
**Supersedes:** None
**Related:** D-122 (advertising posture), D-123 (promotion architecture)

### Decision
Activate boost monetization (begin selling Featured Listings) when ALL conditions are met:

1. Active listings >100 per major category (phones, laptops, generators).
2. ≥50 verified sellers across the platform.
3. Buyer messaging traffic averages >10 conversations/day.
4. At least one fraud incident successfully prevented by trust filters (validates trust signals work).

### Operational
- **Before all four conditions met:** build infrastructure quietly. Do NOT sell boosts.
- **After all four conditions met:** ship Featured Listings, market to verified sellers, measure click/transaction lift over 30 days before expanding to other boost tiers.

### Calibration note
Thresholds are placeholder targets; revise quarterly based on actual marketplace behavior. Track-back: if any threshold turns out to be wrong, document why and append a new clarification (preserves the audit trail rather than editing in place).

---

## D-124: Product Quality Operational Doctrine — Permanent World-Class Mandate

**Date:** 2026-05-23
**Status:** Locked — operational doctrine, supersedes nothing but **extends and strengthens D-121** + the D-121 Reaffirmation
**Supersedes:** None
**Related:** D-121 (world-class UX/UI standard — the foundation), D-121 Reaffirmation (launch-prerequisite quality bar), D-112 (trust-first marketplace positioning), D-120 (registered payment details — the ₦1m transaction reference), D-119 (filter quality), D-122/D-123/D-123b (advertising/promotion architecture — quality of monetization surfaces), D-117 (data protection — trust posture)

### Decision
From this point onward, ShowMePrice operates under a permanent world-class product mandate. **This is not cosmetic polish. UX/UI quality is part of the trust system itself.**

ShowMePrice competes in a Nigerian commerce environment where users already experience high-quality interaction standards daily (WhatsApp, Telegram, Opay, PalmPay, Uber, TikTok, Temu, Instagram, modern fintech apps). **"Good enough for Nigeria" is rejected as a product standard.**

All future implementation work must optimize for:
- trust perception,
- transaction confidence,
- emotional stability,
- interaction quality,
- mobile-first usability,
- and premium marketplace coherence.

### Core Principle
Every trust-critical surface must answer:

> **"Would a Nigerian user feel comfortable entering a ₦1m transaction here?"**

If the answer is "not fully," the surface is not complete.

### Trust-Critical Surface Doctrine
Not all surfaces require equal polish priority. The doctrine codifies which surfaces get premium treatment vs which can remain operationally simpler at MVP.

#### Tier 1 — Premium treatment required
These directly affect marketplace trust perception and must receive world-class UX/UI treatment:
- Messaging
- Listings
- Seller profiles
- Search/discovery
- Contact reveal flow
- Payment-detail reveal flow (D-120)
- Onboarding
- Verification states
- Moderation/reporting flows
- Loading states
- Empty states
- Mobile responsiveness
- Image loading/performance
- Transaction-related warnings and confirmations

These surfaces should be benchmarked against the strongest product users already know for that interaction category:
- Messaging → WhatsApp / Telegram quality
- Transaction flows → modern fintech quality (Opay / PalmPay / Stripe)
- Discovery/search → premium marketplace quality (Airbnb / Stripe-product-style)
- Mobile interactions → best-in-class mobile app quality

#### Tier 2 — Simpler acceptable initially
The following may remain operationally simpler during MVP as long as functionality is correct:
- Internal admin tooling
- Analytics dashboards
- Backoffice operational views
- Advanced seller metrics
- Low-frequency settings pages

Do not waste launch energy over-polishing non-trust-critical surfaces.

### Calm UI Principle
World-class for ShowMePrice means:
- calm,
- restrained,
- structured,
- premium,
- trustworthy,
- intentional.

**Reject:**
- visual clutter,
- trendy startup aesthetics,
- excessive animation,
- noisy interactions,
- gimmicky UI,
- hyper-social-feed styling,
- crypto-dashboard aesthetics.

**Preferred reference feeling:**
- Stripe
- Linear
- Airbnb
- Apple
- Telegram
- premium fintech products

### Performance Is Part of Trust
Performance is not an optimization task later. **It is part of the trust architecture.**

Prioritize:
- optimistic UI,
- instant interaction feedback,
- fast image loading,
- smooth scrolling,
- responsive mobile interactions,
- skeleton states over blank waiting,
- low-bandwidth resilience,
- **Android-first realities** (lower-end devices are the modal Nigerian user).

Laggy or inconsistent behavior weakens marketplace trust perception.

### No Dead-End States
No user flow should feel abandoned or uncertain. Every state must feel **intentional, guided, and emotionally stable.**

This explicitly includes:
- empty inbox
- no listings
- no search results
- pending verification
- failed uploads
- seller no-response
- moderation states
- blocked actions

### Nigerian Marketplace Realism
Every major feature must be evaluated against **real Nigerian marketplace behavior, not ideal-user behavior**.

Assume:
- negotiation-heavy commerce,
- low baseline trust,
- WhatsApp habits,
- remote buying anxiety,
- scam awareness,
- intermittent connectivity,
- lower-end Android devices,
- aggressive bargaining,
- seller response delays,
- and emotional sensitivity around money.

The product should **reduce transaction anxiety without becoming restrictive or bureaucratic.**

### Seller Quality > Feature Quantity
Do not optimize for raw listing volume.

Prioritize:
- seller trust quality,
- listing quality,
- transaction quality,
- response quality,
- moderation quality,
- buyer confidence.

**A smaller trusted marketplace is strategically stronger than a larger chaotic marketplace.**

### Simplicity Is Premium
World-class does NOT mean feature-heavy.

Prefer:
- clarity over complexity,
- consistency over novelty,
- restraint over over-engineering,
- confidence over visual noise.

Do not introduce UI complexity unless it materially improves transaction trust or marketplace quality.

### Manual Before Automation
If trust/safety operations are not fully understood operationally:
- prefer manual workflows first,
- observe behavior,
- gather marketplace data,
- then automate later.

Do not prematurely automate moderation, fraud handling, or trust systems before operational patterns are understood.

### Product Review Standard
Future surface findings (agent or owner) must begin with:

1. **What does world-class look like here?**
2. **What do the strongest competitors do for this interaction?**
3. **How do we achieve premium trust perception while preserving simplicity?**
4. **What is the calmest and clearest UX that still feels powerful?**

**Not:**
- ~~"What is the quickest implementation?"~~
- ~~"What can technically ship?"~~
- ~~"What is good enough for MVP?"~~

### Launch Objective (reframed)
The launch objective is **NOT** "minimum viable product."

The launch objective is:

> **"minimum trust-compromising product."**

Quality is now a core operational requirement, not optional polish.

### Operational impact (in addition to D-121 + D-121 Reaffirmation clauses)
- **Tier classification in surface findings:** every commit's surface findings should explicitly identify which Tier the affected surfaces are. Tier 1 gets the full Product Review Standard; Tier 2 gets correctness + clarity without polish-rounds.
- **The ₦1m question is the acceptance test.** Before any Tier 1 surface ships, the agent + owner ask: "Would a Nigerian user feel comfortable entering a ₦1m transaction here?" If not fully, the surface is not done.
- **Reference benchmarks attached to surface findings.** For each Tier 1 surface, the agent's findings must name the specific competitor product(s) it's being measured against (e.g., "messaging against WhatsApp", "search against Airbnb").
- **Calm UI reject-list applied to every commit.** No trendy startup aesthetics, no crypto-dashboard styling, no hyper-social-feed patterns slip in regardless of how "modern" they might look in isolation.
- **Performance reviewed in surface findings**, not as a follow-up. Skeleton states, optimistic UI, image loading strategy, bandwidth resilience — these are first-class concerns in scoping.
- **Dead-end audit is a banked review step.** Empty / loading / error / pending / blocked states get explicit treatment in surface findings, not deferred to "polish later."
- **Stage 2.B Commits 4.2 / 5.x / 6 already operated under this discipline in practice** (D-121 + Reaffirmation drove sticky composer, hydration fixes, red counts, read receipts, skeletons, pagination). D-124 codifies the pattern formally so it can't drift in future stages.

---

## D-125: Launch Strategy — "Simple Internally, Premium Externally"

**Status:** Locked (2026-05-29, banked to canonical DECISIONS.md)
**Drafted:** Sunday, May 24, 2026

**Intent:** D-125 is not temporary launch guidance. It is enduring product-governance doctrine for ShowMePrice — foundational philosophy intended to outlast Stage 2.C and shape product decisions across all phases of the platform's life.

### Doctrine foundation

> "Trust compounds slowly and breaks quickly."

Every governance principle, phase decision, and scope classification in D-125 derives from this foundation. Trust is the platform's only durable moat; protecting it is the highest-priority product activity.

### Anchor question — permanent governance filter

Apply to every roadmap, design, moderation, onboarding, and monetization decision:

> "Does this reduce user uncertainty and increase transaction confidence?"

If yes: invest. If no: defer or reject. Apply across:

- Roadmap filtering
- Design review
- Moderation policy review
- Onboarding flow review
- Monetization decisions
- Feature-request triage

### Core principle

> "Launch quality matters more than launch complexity."

### Governance principles

ShowMePrice operates under eight enduring governance principles. Each closes a specific failure mode common in Nigerian marketplaces.

**1. Trust over novelty**

> Ship features because they reduce friction, confusion, or uncertainty. Do not ship features because they feel innovative. Nigerian marketplaces are already overloaded with gimmicks, clutter, overgrowth, and inconsistent flows. ShowMePrice feels intentional, restrained, and stable.

**2. Consistency over velocity**

> ShowMePrice prioritizes consistency over feature velocity. A slower, coherent platform is preferred over rapid expansion that weakens trust, usability, or product coherence. Post-traction pressure to ship faster than coherence allows is explicitly resisted.

**3. Every trust surface matters**

> Trust is shaped not only by major features, but by every interaction surface — including loading states, retries, notifications, onboarding, moderation messaging, recovery flows, empty states, and mobile responsiveness. These are not minor UX. They ARE trust infrastructure and receive Tier 1 treatment per D-124.

**4. Calm over engagement**

> ShowMePrice prioritizes calm confidence over addictive engagement mechanics. Streaks, feeds, dopamine notifications, infinite scroll, and viral UX patterns are explicitly rejected. Differentiation comes from calmness, not engagement-loop optimization. This protects the platform's positioning against Facebook Marketplace, Instagram commerce, and TikTok commerce patterns.

**5. Real-world reliability over benchmark optimization**

> Real-world reliability under typical Nigerian mobile conditions is prioritized over synthetic benchmark performance. Lighthouse scores and lab metrics matter less than performance under weak MTN signal, Android memory pressure, tab backgrounding, and unstable network or power conditions. Tested on real devices on real carrier networks — not desktop emulation alone.

**6. Human moderation before automation escalation**

> ShowMePrice prefers human-understandable moderation systems before introducing heavier automation or opaque trust scoring. Automation is built on observed patterns from real platform usage (Phase 2), never on speculative heuristics. This protects against opaque moderation, over-automation, and trust-damaging false positives.

**7. Marketplace-native, not social-media-native**

> Features reinforce commerce confidence and transaction clarity rather than imitate social-media engagement patterns. Messaging is calm commerce communication, not generic social chat. Image sharing is product-context-aware (caption-below-grid, hero-image layout, listing chip in viewer), not generic photo sharing. Protects against drift toward stories, feeds, algorithmic distraction, and vanity engagement systems.

**8. Launch quality over launch quantity**

> The moat is calmer, more trustworthy, more coherent commerce UX — not more features, more tabs, or more systems. Startup pressure to "ship more" is explicitly resisted when shipping more weakens any of the above seven principles.

### Strategic risk — what D-125 protects against

> **ShowMePrice should never become noisy.**

This is the biggest long-term strategic risk. Nigerian marketplaces naturally drift toward clutter: sellers demand visibility hacks, monetization pressures create UI pollution, growth pressure creates engagement spam, feature requests pile on. D-125 is the doctrine that protects calmness.

### Phase structure

**Phase 1 — TRUSTABLE MVP (CURRENT)**

Focus: UX polish, listings, messaging, verification, moderation basics, contact reveal flow, mobile polish.

Goal: "This feels safer and more professional than competitors."

NOT: "This has every feature."

**Phase 2 — MARKETPLACE LEARNING (post-launch, after real users arrive)**

Observe: fraud patterns, seller behavior, reveal behavior, negotiation patterns, moderation load.

Real marketplace intelligence starts only after real data exists. **Sequencing note: Phase 2 must complete before Phase 3 begins** — real fraud patterns must be observed before automation logic becomes trustworthy.

**Phase 3 — TRUST INTELLIGENCE (only after Phase 2 yields data)**

Behavioral scoring, trust weighting, sophisticated ranking, moderation intelligence, fraud heuristics.

Requires real observational data from Phase 2 to be meaningful. Automation built on speculation rather than observation is rejected per Principle 6.

**Phase 4 — MARKETPLACE SCALE (only after liquidity exists)**

Advanced promotions (Featured Listings per D-123/D-123b), seller ecosystems, diaspora systems, logistics partnerships, institutional tooling.

### Launch scope classification

**FULLY IMPLEMENT NOW:**

- UX/UI polish (per D-121 + D-124)
- Messaging quality (Stage 2.B complete; Stage 2.C image sharing in progress)
- Verification basics (phone verification working; tiers framework ready)
- Moderation basics (D-119 filter operational)
- Legal/privacy foundation (Terms + Privacy Policy drafts ready for lawyer review)
- Mobile-first quality (Nigerian Android-first realities)
- Trust presentation (verification badges, response signals)
- Reveal system (D-113 contact reveal)
- Admin visibility/logging (basic moderation evidence retention)

**PARTIALLY IMPLEMENT NOW (infrastructure stub, intelligence deferred):**

- Boosts infrastructure (per D-123 architecture, activation per D-123b — DO NOT activate at launch)
- Moderation intelligence (D-119 filter exists; sophistication evolves with observed fraud per Principle 6)
- Trust-ranking (additive framework per D-123; sophisticated ranking science deferred to Phase 3)
- Analytics (basic operational metrics only)
- Seller scoring (basic ratings infrastructure; behavioral scoring deferred to Phase 3)

**DELAY UNTIL DATA OR LIQUIDITY EXISTS:**

- Escrow / fund custody (per D-111 — explicitly NOT a launch feature)
- Advanced AI moderation (current D-119 filter is enough at launch)
- Sophisticated ranking science (requires Phase 2 data per Principle 6)
- Complex automation (manual operational steps acceptable at MVP)
- Enterprise-scale systems (architecture sized for thousands, not millions)

### The biggest mistake to avoid

> "Imagined scale architecture" — systems optimized for millions of users before validating thousands. This kills many startups. Do not build for scale that hasn't been validated.

### ShowMePrice's moat is

- Trust
- UX
- Emotional professionalism (per D-121 + D-124)
- Structured commerce
- Calmness (per Principle 4)

NOT:

- Maximum features
- Enterprise-scale architecture
- Hyper-automation
- Engagement-loop optimization

### What "premium externally" actually means

Premium for Nigerian marketplaces means:

- Clear feedback at every interaction
- Visible trust signals
- Strong mobile responsiveness
- Reliable messaging
- Graceful recovery from errors
- Emotional stability under stress

Premium does NOT mean:

- Sterile minimalism
- Empty interfaces
- Information-deprived screens
- Cold, distant UX

**Reference products** (for premium quality calibration): Stripe, Linear, Airbnb, Apple, Telegram, premium Nigerian fintech apps. These emphasize clarity, calmness, polish, confidence, and intentionality — not entertainment, virality, or dopamine loops.

### What "world-class" means at launch

| World-class IS | World-class is NOT |
|----------------|---------------------|
| Calm | Feature-complete |
| Polished | Enterprise-scale |
| Responsive | Hyper-automated |
| Trustworthy | Engagement-optimized |
| Coherent | Cluttered |
| Emotionally stable | Noisy |
| Intentionally designed | Imitation-driven |
| Reliable under real conditions | Benchmark-optimized |

### Operational implications

- Surface findings under D-121/D-124 should explicitly classify proposed features by phase (Phase 1 vs Phase 2/3/4 work)
- Resist "while we're in here, let's also add X" expansions that build for unvalidated scale
- Stage scoping decisions reference this D-125 phase framework
- Apply the anchor question to every meaningful product decision
- Apply the eight governance principles when evaluating feature requests, design choices, monetization options, and roadmap pressure
- Re-evaluate quarterly as marketplace data accumulates
- D-125 should be referenced by future agent sessions as foundational doctrine, not temporary MVP guidance

### Related decisions

- **D-111** (No financial custody at MVP) — supports "delay escrow"
- **D-112** (Trust-first positioning) — defines what "world-class" means for ShowMePrice
- **D-119** (Phone-number filter for moderation) — concrete application of Principle 6
- **D-121** (UX/UI quality standard) — defines what "polished" means
- **D-122** (Advertising posture) — supports "delay advanced promotions" + Principle 4 (no engagement-style ad surfaces)
- **D-123 / D-123b** (Promotion architecture + activation triggers) — supports "partial implementation now, activation when conditions met"
- **D-124** (Product quality operational doctrine) — Tier 1/2 classification supports "polished externally, manageable internally" + Principle 3 (every trust surface matters)

---

## D-126 — Communication & Content Doctrine

**Status:** Locked (2026-05-25, banked to canonical DECISIONS.md)
**Cross-references:** D-124 (Calm UI), D-125 (Trust narrative + governance doctrine)

### The principle

ShowMePrice's moat is product, not content. The platform's communication to users — every email, notification, message, in-app prompt, journal piece, future newsletter — exists to serve trust, never to manufacture engagement.

### Communication posture

Intelligence-first, never promotion-first.

The brand psychology goal: users learn that ShowMePrice only contacts them when there is genuine value to deliver. Over time, this becomes a competitive advantage — attention that Nigerian users have learned to withhold from platforms that have trained them to ignore notifications.

### What this means in practice

**For transactional emails (live now):**
- One action triggers one email. No follow-up sequences.
- Calm baseline tone — no exclamation marks, no celebration emoji, no marketing copy bleeding into transactional surfaces.
- Reference points: Stripe, Linear, Apple — not generic SaaS or Nigerian e-commerce.

**For future communication surfaces (newsletter, journal, etc.):**
- Content categories that fit: pricing trends, trust insights, scam awareness, category movement, seller standards, buyer safety, verification mechanics, safe-commerce education.
- Content categories that do NOT fit: promotional roundups, "trending now" engagement loops, FOMO-driven highlights, generic e-commerce content, AI-written filler.

### Cadence boundaries

Monthly maximum for any subscription-based communication. Never daily. ShowMePrice should never train users to expect frequent contact.

### What ShowMePrice does NOT do

- 🎉 emoji or "Welcome aboard!" hustle copy
- Marketing communications mixed into transactional emails
- Newsletter subscription prompts in transactional flows
- Discount offers (impossible by business model — D-125 §2.3 No Custody)
- Engagement loops or growth-hack tactics in communication

### Why this matters for Nigerian marketplace context

Nigerian users have developed strong skepticism toward promotional marketplace communication due to the noise level of modern commerce platforms. That skepticism is rational given how attention has been treated by mainstream e-commerce.

ShowMePrice's positioning advantage is being recognizably different. A user who receives ShowMePrice email expects it to be useful, because ShowMePrice has demonstrated that it doesn't send anything else.

This doctrine is foundational. It shapes every adjacent decision: journal content shape, future newsletter scope, in-app prompts, moderation tone, even how customer support communicates.

---

## D-127 — Journal Surface (`/journal`)

**Status:** Locked architecturally (2026-05-25, banked to canonical DECISIONS.md); implementation deferred to Stage 3
**Cross-references:** D-125, D-126

### The principle

ShowMePrice's content surface is a journal — not a blog, not a content marketing channel, not an SEO play.

A journal is reflective, authoritative, and slow. It exists to compound trust through trust intelligence — education about safe commerce, verification mechanics, fraud awareness, and marketplace patterns specific to the Nigerian context.

### URL path

`/journal`

Not `/blog`, not `/learn`, not `/news`, not `/insights`.

Reasoning: "Journal" carries premium tone aligned with calm brand positioning. "Blog" sounds generic. "Learn" sounds tutorial-driven. "News" suggests recency cadence. "Insights" sounds corporate.

### Content shape

Trust intelligence pieces, not content marketing posts.

**Aligned content categories:**
- Fraud pattern education (e.g., "How fake payment alerts work in Nigeria")
- Pre-purchase verification guidance (e.g., "What to verify before buying a used iPhone")
- Platform mechanics transparency (e.g., "How seller verification works on ShowMePrice")
- Category-specific scam awareness (e.g., "Common generator scam patterns")
- Marketplace economics (e.g., "Why price transparency matters")
- Safe inter-state commerce (e.g., "How to safely buy outside your state")

**Anti-patterns explicitly rejected:**
- SEO roundup content ("10 best phones under ₦200k")
- AI-written filler
- "Trending now" engagement-hack pieces
- Generic e-commerce content
- Anything that exists to game search rankings rather than serve readers

### Launch shape

Ship 3-5 foundational pieces at once. A single-post journal feels abandoned. The opening collection establishes ShowMePrice as the authority on safe Nigerian commerce from day one.

### Cadence post-launch

Slow and authoritative. No commitment to weekly or even monthly output. A piece ships when there's something genuinely worth saying, not because the editorial calendar demands it.

If/when the journal stabilizes with regular content velocity, a newsletter delivery mechanism may emerge — but the newsletter is a distribution surface for journal content, never a separate content stream.

### Why this comes before a newsletter

Journal content is:
- Evergreen (vs newsletter which expires after sending)
- Searchable via Google (compounds organically over time)
- Referenceable (can be linked from Terms, Privacy, About, transactional emails, customer support replies)
- Operationally low-pressure (no subscriber list to maintain, no send cadence pressure, no unsubscribe management)
- Calm (no inbox interruption)

Journal precedes newsletter. Newsletter without journal is promotional. Newsletter as delivery mechanism for journal content is intelligence-first per D-126.

**The journal exists to increase transaction confidence, not platform engagement.** This anchor sentence prevents future drift toward engagement-optimization patterns that would erode trust positioning.

### Implementation timing

Stage 3+. After private beta operations stabilize, after Stage 2.C fully closes, after Commits 11 and 12 ship. Not before.

When implemented, technical scope: static MDX or markdown-based routes under `/journal/[slug]`, no commenting system, no engagement mechanics, no email-capture forms, no related-posts engagement loops.

---

## Operational Doctrine — Implementation-Path Independence

**Status:** Locked (2026-05-25, banked to canonical DECISIONS.md); surfaced during Commit 11 K-055 deferral deliberation
**Cross-references:** D-125 (trust governance), agent-handoff doctrine, KNOWN_ISSUES.md K-055 resolution note

### The principle

Implementation-path failure does not automatically redefine feature-objective completion.

When an approved implementation path proves invalid mid-work, the underlying objective does NOT automatically close via partial work completed via alternative paths. The path is replaceable; the objective remains open until objectively met or explicitly deferred via documented decision.

### Example case (K-055)

DP-8 approved "Attempt next/image first, fallback to manual if unsupported." Investigation revealed next/image is incompatible with Cloudflare Pages free tier. The partial work delivered (`loading="lazy"` on plain `<img>` via K-053 ProductImage wrapper) addresses one DP-9 concern (lazy-load) but does NOT close K-055's full scope (responsive srcset/sizes per DP-10).

The correct disposition: K-055 remains OPEN with explicit deferral note, not silently closed via partial delivery.

### Operational implications

For agents implementing approved DPs:
- Approved DPs are deliverables, not aspirations
- If an implementation path proves invalid, escalate the path failure
- Do NOT silently substitute partial alternative work and frame as "complete"
- Path failure → escalate scope decision → wait for Frank → then proceed
- Silent descope (regardless of how reasonable the partial delivery looks) is a discipline failure

For Frank reviewing agent reports:
- Verify all approved DPs are explicitly addressed (delivered, deferred, or escalated)
- "Optional enhancement" framing on a previously-approved DP is a silent descope signal
- Investigation findings → product judgment (Frank decides) → then proceed

This doctrine shapes all future agent escalation patterns and commit verification workflows.

---

## D-128 — Four-Phase Marketplace Lifecycle

**Status:** Locked (2026-05-29)
**Cross-references:** D-114 (phone primacy), D-121 (UX/UI standard), D-124 (calm restraint), D-125 (trust governance), D-126 (communication doctrine), D-127 (journal surface)

### The principle

ShowMePrice operates on a four-phase product lifecycle. Each phase has distinct success criteria, distinct mindset, and distinct anti-patterns. Transitions between phases require explicit signal validation, not feature completion or external pressure.

This doctrine exists to prevent premature scaling before behavioral understanding.

### The four phases

**Phase 1 — Private Beta** → **Phase 2 — Marketplace Learning** → **Phase 3 — Trust Intelligence** → **Phase 4 — Marketplace Scale**

Most marketplaces collapse these into a single "launch and grow" mental model. ShowMePrice deliberately separates them because the work, the mindset, and the risks are fundamentally different in each phase.

### Phase 1 — Private Beta

**Goal:** Validate the trust-first marketplace thesis with controlled real-world usage.

**Scope:** Small controlled invite-only cohort. No public announcement. No marketing. No monetization pressure.

**KPI:** Trust recurrence — voluntary repeated trust behavior. NOT DAU, sessions, installs, or signups.

**Active work:** Observation, refinement, validation, trust system tightening.

**Explicit anti-patterns:**
- Public launch announcements (Twitter, Product Hunt, mass WhatsApp)
- Growth hacking or virality optimization
- Feature additions based on user requests
- Investor-driven scaling pressure
- Vanity analytics dashboards
- Aggressive moderation tooling expansion
- Newsletter or content marketing
- Influencer campaigns

### Phase 2 — Marketplace Learning

**Goal:** Understand real Nigerian marketplace behavior before scaling systems.

**Mindset:** Marketplace Learning prioritizes observation over optimization.

**Active work:** Behavioral observation, controlled monetization introduction, journal launch, better moderation tooling, lightweight trust scoring beginnings.

**Explicit anti-patterns:**
- Recommendation engines or algorithmic feeds
- Growth loops or viral mechanics
- Aggressive paid advertising
- Complex subscription tiers
- Mass marketing campaigns
- Investor-driven feature roadmap
- Black-box AI or ML-based trust scoring
- Premature category expansion

### Phase 3 — Trust Intelligence

**Goal:** Codify learned behavior into ShowMePrice's competitive moat.

**Active work:** Smarter ranking, fraud heuristics, reputation systems, trust weighting, seller quality scoring, category intelligence, pricing intelligence.

**Explicit anti-patterns:**
- Building intelligence without observed data
- Copying competitor patterns without local validation
- Optimizing for engagement over trust

### Phase 4 — Marketplace Scale

**Goal:** Expand trusted marketplace to broader audience and adjacent categories.

**Active work:** Geographic expansion, category expansion, partnership development, infrastructure scale.

**Explicit anti-patterns:**
- Scaling before trust intelligence is operational
- International expansion before national maturity
- Adjacent product expansion before core marketplace stable

### Transition criteria: Beta → Marketplace Learning

ShowMePrice can transition from Private Beta to Marketplace Learning ONLY when all of the following are observable and falsifiable:

**Transaction reality:**
1. Minimum 10-20 completed real transactions (buyer reached seller, met or arranged delivery, money exchanged, goods received)
2. At least one organically successful high-value transaction (>₦50K) completed without operational intervention

**Voluntary return behavior:**
3. ≥30% of beta invitees return within 14 days WITHOUT being prompted by ShowMePrice messaging
4. At least 3 beta sellers list a second item after their first sold

**Moderation manageability:**
5. <10 total reports during beta period
6. All reports map to identifiable patterns (no surprise abuse vectors)

**Trust mechanism validation:**
7. Verified sellers receive measurably more messages than unverified sellers
8. Beta users use in-app messaging organically (don't immediately migrate to WhatsApp before sharing details)
9. Welcome email recipients click through to Browse or Become Verified (not just delete)

**Operational capacity:**
10. No critical bugs OR rapid fixes when bugs surface
11. Storage costs track expectedly
12. Database performance healthy at beta scale

If any are false, beta continues OR the specific gap gets addressed. Phase transition is binary: all-or-nothing, never partial.

### Transition criteria: Marketplace Learning → Trust Intelligence

ShowMePrice can transition from Marketplace Learning to Trust Intelligence ONLY when:

1. Repeat trust behavior is observed (not isolated wins)
2. Top 5 fraud/abuse patterns are documented and understood (not eliminated — understood)
3. Reveal credits monetization validated (doesn't kill engagement, serious buyers convert)
4. Seller quality patterns clearly emerged (who succeeds, churns, scams, converts)
5. Operational load reaches threshold justifying scale tooling

### The strategic insight

ShowMePrice's competitive moat is NOT features, UI, or even verification alone. The moat is accumulated marketplace trust intelligence about Nigerian commerce behavior — fraud patterns, trust signals, moderation calibration, pricing behavior, seller quality patterns.

Features can be copied in months. Trust intelligence compounds over years and cannot be copied without the same observed reality.

### The mindset shift

Most founders think: "beta → public launch → scale."

ShowMePrice thinks: "beta → learning → intelligence → scale."

This single mental model shift prevents the most expensive marketplace mistakes: premature scaling, over-engineering, growth desperation, and monetization friction before behavioral understanding.

### Why this matters operationally

When investors push for "show me growth," the operational answer is: "We're in [current phase]. Growth comes after [next phase transition criteria]." Not all investors will align with this pacing. Those who do not are not aligned with ShowMePrice's trust-first thesis.

When beta users request features, the phase-appropriate answer is: "We're in observation mode. Feature requests inform Marketplace Learning planning, not Beta scope."

When competitors launch aggressively, the correct response is: "Competitor growth can be copied. Compounded marketplace learning cannot."

### What this doctrine prevents

- Launching publicly before behavioral validation
- Optimizing monetization before observing trust behavior
- Building intelligence systems without observed data
- Scaling infrastructure before learning what to scale
- Adding features during phases when observation is the active work
- Treating user feedback as product roadmap during validation phases
- Letting external pressure (investor, competitor, market) override phase-appropriate work
- Premature confidence from small-sample positive feedback

### What this doctrine enables

- Honest answers to "when are you launching publicly?"
- Defensible decision-making against external pressure
- Compound trust intelligence as competitive moat
- Calm operational tempo aligned with actual learning needs
- Clear delegation when team grows ("we're in [phase], here's what matters")

### Core operating principle

**The active phase determines what work is appropriate.**

---

## D-129 — Payment Integration Sequencing

**Status:** Locked (2026-05-29)
**Cross-references:** D-125 (Launch Strategy — Simple Internally), 
D-128 (Four-Phase Marketplace Lifecycle), K-064 (Paystack merchant integration)

### The principle

Payment integration follows the four-phase marketplace lifecycle. 
Each phase enables only the payment infrastructure appropriate to its 
observation goals. Premature payment complexity creates operational 
debt that compounds against trust validation.

This doctrine prevents over-engineering payment architecture before 
behavioral understanding justifies it.

### The sequencing

**Phase 1 (Private Beta):** Payment infrastructure dormant.
- Reveal credits feature exists in UI
- Credits manually granted free to beta invitees
- No live Paystack transactions
- Goal: observe whether users notice credit mechanism, how they assign 
  value to reveals, whether UX is intuitive

**Phase 2 (Marketplace Learning):** One-time payments enabled.
- Paystack KYB complete (target: before phase transition)
- Initialize Transaction API for reveal credits + listing boosts
- Webhook verification fully implemented
- No subscriptions yet
- Goal: validate reveal credits monetization (does friction kill 
  engagement, do serious buyers convert)

**Phase 3 (Trust Intelligence):** Subscriptions enabled.
- Subscription API for Buyer Pro / Seller Pro
- Subscription lifecycle management (cancellation, failed-renewal, 
  upgrades, downgrades)
- Trust scoring data informs subscription tiers
- Goal: codify learned monetization behavior into sustainable revenue

**Phase 4 (Marketplace Scale):** Advanced payment patterns.
- Geographic expansion may introduce new payment providers
- Category-specific pricing models
- Partnership integrations

### Non-negotiable rules at every phase

**1. Webhook verification is mandatory.** Never trust frontend payment 
success state. All credit grants, subscription state changes, and 
payment confirmations route through server-side webhook handlers with 
Paystack signature verification.

**2. Stay transaction-simple.** Do not implement:
- Internal wallet systems
- Balance/ledger systems
- Marketplace payouts
- Escrow accounting
- Split settlement

ShowMePrice is the merchant collecting payment for ShowMePrice services. 
Buyer-seller transactions happen directly between parties per D-125 §2.3 
(No Custody).

**3. Idempotent webhook handlers.** Paystack webhooks may fire multiple 
times for the same event. Credit grants must be idempotent — duplicate 
webhook delivery never grants duplicate credits.

**4. Compliance posture preserved.** "ShowMePrice is the merchant" is 
the standard answer to "are you a payment processor?" questions. Do 
not drift into escrow or marketplace splits without explicit doctrine 
revision.

### Explicit anti-patterns

- Implementing subscriptions during Private Beta (no behavioral data yet)
- Building wallet UI before reveal credits are live and validated
- Trusting frontend payment confirmation as authoritative
- Adding new payment providers before primary integration is mature
- Premature subscription tier complexity (start with one tier; expand 
  based on data)

### Why this matters operationally

When investors ask "what's your monetization model?" — the answer is 
reveal credits + subscriptions, in that sequence, validated against 
observed trust behavior. Not: "we have everything ready to enable."

When future agents implement payment features, the question isn't "can 
we build X?" but "is X appropriate to the current phase?"

When competitors launch complex payment systems, the disciplined response 
is: "Complex payment infrastructure without trust validation is fragility, 
not capability."

### The strategic insight

Payment simplicity at v2 is operational advantage, not limitation. 
Paystack's response confirmed the marketplace model is compliance-clean 
because we deliberately avoid escrow, splits, and custody. That clarity 
took architectural restraint to preserve. Maintain it through Phase 3 
minimum.

### Core operating principle

**Implement only the payment infrastructure that current phase observation 
requires. Defer everything else.**

## D-130 — Mocean is the active OTP provider for private beta

**Status:** Locked (2026-05-28)
**Cross-references:** D-094 (OTP provider abstraction), D-060 (Termii fallback sender ID), D-062 (Supabase Pro for phone auth)

**Context:** Wave 1A.1 launch was blocked by SMS non-delivery. Root cause: `OTP_PROVIDER_VENDOR=arkesel`, but the Arkesel account is configured for South African delivery only — not Nigerian. End-to-end verification on `app.showmeprice.ng` to a real Nigerian MTN number (`+2348143850265`) via Mocean completed signup successfully and cleared the gate.

**Decision:** **Mocean** is the active OTP provider for private beta via `OTP_PROVIDER_VENDOR=mocean`. **Termii** and **Arkesel** remain implemented as switchable fallbacks behind the same `OtpProvider` interface (D-094 holds — vendor swap is a one-line env-var change).

**Implementation:** Mocean integrated via the plain Send SMS endpoint (`rest/2/sms`), NOT the Verify API. The app continues to own the OTP lifecycle — generate code, salted SHA-256 hash, store in `phone_verifications`, verify against user input, mark consumed. The provider is delivery-only.

**Active account state (as of banking):**
- €20 topped up.
- **€0.317/SMS bridge rate** with **randomized sender** (until sender-ID is approved).
- Sender-ID `"ShowMePrice"` registration LOA + CAC certificate submitted; **operator approval pending** (a few weeks to ~1 month). On approval: unlocks **€0.008/SMS** rate + branded sender across all networks.

**Provider roadmap:**
- **Arkesel** — needs a Nigerian account + KYB submission. Do this when back in Nigeria. Re-evaluate once active.
- **Termii** — activates when fully launched (per D-060 / D-061 / D-094 — Termii was the original Phase E choice).
- **Mocean** — primary for private beta; reassess against Termii at public launch based on cost (post sender-ID approval) and delivery reliability.

**Why this matters operationally:** the provider abstraction (D-094) paid its first real dividend — Mocean dropped in without touching any application code beyond the new provider module. Vendor friction is real (sender-ID approvals are weeks-long across all NG providers); the abstraction lets us keep moving rather than waiting on any one vendor.

**DB note:** `phone_verifications_provider_check` was extended via raw SQL to accept `'mocean'` (in addition to `'termii'` / `'arkesel'`). A migration file matching this change is owed — see K-067.

## D-131 — Seller WhatsApp number must be OTP-verified before it is revealable

**Status:** Locked (2026-05-28)
**Cross-references:** D-009 (WhatsApp number format), D-093 (Phone-verification gate reaches contact-reveal), D-113 (Trust ladder), D-114 (Anti-abuse policy)

**Context:** Phase E reveals seller contact details to Pro / credit-using buyers. The reveal target has historically been `profiles.phone` — the seller's verified primary phone. Sellers have legitimate reasons to want a **separate** WhatsApp number revealed (business line, partner's phone, etc.). A prior implementation attempt added `businesses.seller_whatsapp` and stored the value **without OTP verification** (a TODO instead of a verify step). That is rejected.

**Decision:** Seller WhatsApp number is **required at seller setup**. Two paths:

1. **Default path (no extra OTP):** use the seller's already-verified `profiles.phone`. Zero added friction. This is the common case.
2. **Alternate-number path:** if a seller enters a **different** number, that number MUST be OTP-verified inline (Option A — verify before the seller account is created/finalized). The unverified value is never stored as revealable.

**Hard rule:** **No unverified seller WhatsApp number may ever be revealable to buyers.** Reveals must point at a number that has demonstrably received and acknowledged a code from us.

**Why the strict bar:** sellers refer other sellers who are not personally vetted by Frank. Once the network grows beyond his first-circle, the revealed contact must be reliable on its own — without depending on social-graph trust to back-stop it. A revealed but wrong-number is a worse buyer experience than no reveal at all, and erodes the "verified seller" promise (D-112).

**Operational consequences:**
- The rejected uncommitted attempt (`migrations/E.2.10.0-seller-whatsapp.sql` + matching code) must be discarded before the corrected build.
- Before building, surface a read-only finding: can `verifyPhoneOtpAction` verify a phone that is NOT the actor's `profile.phone`, without granting account-level phone-verified status or overwriting `profile.phone`? Either the existing flow supports it (cheap path) or a parallel `seller_phone_verifications` mechanism is needed. Decide before implementing.
- The seller-setup flow needs a one-time gate for the alternate-number path; the default-path remains a single checkbox / pre-filled field.

## D-132 — Messaging and contact-reveal coexist; neither replaces the other

**Status:** Locked (2026-05-28)
**Cross-references:** D-095 (Messaging MVP scope), D-113 (Trust ladder), D-095 (in-app messaging shipped Stage 2.B)

**Context:** With in-app messaging shipped (Stage 2.B), there is internal pressure to treat messaging as the primary buyer→seller channel and downgrade contact-reveal to a niche fallback. That would collapse the trust ladder and over-trust the in-app chat surface.

**Decision:** Messaging and contact-reveal are **complementary**, not substitutes. The D-113 trust ladder remains:

**browse → message → reveal contact → share payment details**

Each rung is a real step a buyer chooses to take. Messaging is the low-cost ask; revealed contact is the elevated, paid (post-beta) step that signals serious intent. Sellers reading their inbox can tell the difference. Neither feature is built or rationalized in a way that subsumes the other.

**Operational consequences:**
- Don't add UI that nudges buyers from "message" to "reveal" prematurely (e.g., never auto-trigger reveal after N messages).
- Don't surface reveal as the headline CTA on listing pages — message remains the lowest-friction first step.
- Reveal-credit pricing (post-beta) is calibrated assuming buyers have already messaged; the credit purchase isn't a substitute for engagement.

## D-133 — Private beta reveal mechanics: 3 free lifetime reveals per buyer, per-seller dedup

**Status:** Locked (2026-05-28)
**Cross-references:** D-084 (signup_free_reveals_remaining counter), D-085 (Credit pack structure — locked but deferred), D-113 + D-113 Clarification (Free-reveal mechanics), D-129 (Payment integration sequencing), D-128 (Four-Phase Marketplace Lifecycle — Phase 1 Private Beta)

**Context:** D-084 established a 1-free-reveal-at-signup counter. D-113 Clarification refined to a configurable lifetime grant at phone verification. Private beta needs an explicit number — small enough to observe value-assignment behavior, large enough to let invitees experience the full happy path without paywalling them.

**Decision:** Private beta grants **3 free contact reveals per buyer, lifetime, granted at phone verification.** Reveals are **per-seller dedup'd** — re-revealing the **same seller** does not consume another credit (the buyer already paid the trust cost for that connection).

**Storage:** reuse the existing `profiles.signup_free_reveals_remaining` counter (D-084's column). **Note:** a live test profile showed value `1` — the beta default must be **3** per this decision. Fix where the counter is set / backfilled before beta launch.

**Per-seller dedup:** the existing `contact_reveals` table already records `(buyer_id, seller_id, listing_id, revealed_at, credit_used, payment_id)`. The reveal action must check for an existing `contact_reveals` row on `(buyer_id, seller_id)` (across all listings — not just the same listing) before decrementing the counter. First-time-for-this-seller reveals consume; repeat-seller reveals are free regardless of listing.

**Deferred to public launch (per D-129 Phase 2 Marketplace Learning):**
- Paid reveal packs (target prices: ₦300 / ₦1,200 / ₦3,000 — superseding D-085's earlier ₦1,500/₦3,500/₦7,000 framing for the post-beta pricing audit).
- Full credit / billing system + Paystack integration.

Private beta stays **free-with-limit.** This is consistent with D-129 — payment infrastructure is dormant in Phase 1; the goal of private beta is to observe trust behavior, not validate monetization.

**Why 3, not 1:**
- 1 is too tight to let an invitee experience the value proposition without immediately hitting a wall — destroys the observation goal.
- 3 lets a buyer reveal across a few sellers and form a meaningful behavior signal (do they actually contact the sellers they reveal? do they re-reveal anyone?).
- Per-seller dedup means a buyer who returns to the same seller multiple times doesn't burn their grant on a duplicate.

**Operational consequence:** the reveal-action code (when built) must implement both the counter decrement AND the per-seller dedup check. Naive "decrement on every reveal" violates this decision.

## D-134 — Seller eligibility: informal/unregistered sellers welcome; trust via verification stack, not CAC

**Status:** Locked (2026-05-28)
**Cross-references:** D-032 (Verification hard gate), D-074 (Vendor selection — Korapay deferred), D-077 (Manual fallback during Korapay delay), D-088 (Founding Seller offer), D-112 (Trust-first positioning), D-114 (Anti-abuse operating policy), D-128 (Four-Phase Marketplace Lifecycle), D-131 (Seller WhatsApp OTP-proven before revealable), K-061 (Admin queue deferred Stage 3+)
**Investigation provenance:** the LIVE / PARTIAL / NOT-PRESENT status of each mechanism below was verified against the codebase via two read-only investigations in this session (verification-stack inventory + listing-moderation / buyer-reporting status check) — not assumed from documentation.

### The principle

ShowMePrice is a Nigerian C2C marketplace serving informal and unregistered sellers as a **core market, not an edge case.** Most Nigerian small businesses operate without CAC registration; requiring it would exclude the very sellers we built the platform to serve.

**CAC registration is NOT required to:**
- Create a buyer account
- Create a seller account
- Publish listings
- Receive buyer messages
- Reveal contact details to buyers

Trust between buyers and sellers is established via the layered verification stack below, not via registry membership.

### Platform's own CAC registration (distinct concern)

**SHOWMEPRICE-NG LIMITED is CAC-registered** — this is the **platform's** credibility to its sellers (and to regulated vendors like Paystack, per D-074 + Stage 2.C closure), not a credential demanded of individual sellers. The platform's compliance posture (legal entity, business bank, vendor KYB) exists so that we can stand behind sellers who don't have those resources themselves.

### Verification stack — current state by mechanism

Status reflects what is actually built and reachable in code today, per the investigations referenced above:

| # | Mechanism | Status | Where it lives | Role in the trust stack |
|---|---|---|---|---|
| 1 | **Profile phone OTP** (Mocean SMS, signup gate) | **LIVE** | `otp-actions.ts` + `mark_phone_verified` RPC + `/verify-phone` UI. Production-verified to real Nigerian MTN number 2026-05-28 (K-066 RESOLVED). | First-tier trust signal: every account holder has a Nigerian phone number we can deliver to. |
| 2 | **Manual seller identity verification** (NIN string + ID document + selfie + address, admin-reviewed) | **LIVE — PRIMARY HARD GATE** | `/sell/verify` (seller) + `/admin/verifications` (admin) + `seller_verifications` table + `verification.ts` state machine. Phase C.5 hard gate (D-032). | The load-bearing live trust mechanism today: until a seller passes manual review, their listings are RLS-hidden from public marketplace. This is the actual buyer-facing "verified seller" promise. |
| 3 | **Seller WhatsApp OTP** (alternate-number verify for buyer reveal) | **LIVE** (as of Stage C) | `seller-otp-actions.ts` + `mark_seller_whatsapp_verified` RPC + `BecomeSellerForm` toggle + `SellerWhatsappRecoveryBanner`. Commits `18a6702` (Stage A schema/RPC), `419cef2` (Stage B actions), `eba2497` (Stage C form/orchestration), `1e8d217` (recovery banner closing degraded-state dead-end). D-131 invariant: no unverified WhatsApp may ever be revealable. | Ensures the contact-reveal target is a number the seller provably controls — preventing the "revealed but wrong number" failure mode at network scale beyond Frank's first-circle. |
| 4 | **Public-listing visibility gating via RLS** | **LIVE** | RLS policy on `products`: rows where the seller's `businesses.verification_status != 'verified'` are filtered out of all public marketplace / category / search queries. D-032 hard gate. | Per-seller, not per-listing. Approval flips ALL the seller's listings public simultaneously; rejection hides them all. |
| 5 | **Buyer reporting / abuse flagging** | **PARTIAL** | Submission LIVE for `target_type='listing'` (`ListingReportButton` on listing detail) + `target_type='message'` (`reportMessage` action + `ReportImageSheet`). `reports` table polymorphic. User-as-target submission NOT BUILT. Admin triage queue NOT BUILT (K-061 — deferred Stage 3+). | Self-serve buyer recourse exists at submission time for two of three target types; admin triage is the gap the next build will close. |
| 6 | **Per-listing admin moderation** (approve/reject/hide individual listings) | **NOT PRESENT** | No admin route, no admin code touching `products`, no `hidden`/`flagged` values in `product_status` enum, no action exists. The `admin_action_log` enum vocabulary includes `'hide_listing'` but no code path invokes it. | The next build closes this gap. Until then, moderation operates at the seller level (mechanism #4) — admin can suspend a whole seller via `/admin/verifications`, but cannot hide a single listing belonging to an otherwise-verified seller. |
| 7 | **Automated NIN verification (Korapay Identity API)** | **PLANNED-NOT-BUILT** | `src/lib/identity/` interface + `KorapayNinVerifier` skeleton; `verifyNin` throws `NotImplementedError`; zero production callers; `kyc_documents` table empty. Gated on Korapay Live Mode approval per D-077; the manual flow (mechanism #2) is the live fallback. | Future automation of the manual NIN review. Not blocking; manual is the live path. |
| 8 | **Email verification flag in `profiles.verification_status` array** | **PARTIAL / NOT REFLECTED IN APP STATE** | Supabase Auth email-confirmation is ON (D-023) — confirmation is enforced via `auth.users.email_confirmed_at` (Supabase-managed). The string `'email_verified'` exists in `profiles.verification_status` vocabulary as a planned value (single comment reference), but **no code writes it** into the array. Any app-level check `verification_status.includes('email_verified')` would always be false today. | Functionally adequate (Supabase enforces confirmation), but the app-level array is not the source of truth for email-verified status. Not a trust-signal surface today. |
| 9 | **BVN verification** | **PLANNED-NOT-BUILT** | Per D-076: deferred to Phase F+. No interface, no implementation, no destination beyond a planned string in `verification_status` vocabulary. | Higher-trust tier for future high-value flows. Not in Phase E scope. |
| 10 | **Google / Facebook OAuth verification** | **PLANNED-NOT-BUILT** | Per D-022. `auth_providers` array allows the future values but no integration. | Phase F+ convenience, not a trust mechanism per se. |

### CAC as an optional FUTURE Pro/premium feature (recorded, not built)

If a seller wants to display a "CAC verified" badge as a status signal — for example, to differentiate themselves as a formal business — that may ship at a future date as a Pro/premium feature with the following invariants:

1. **Optional, never required.** Sellers who choose not to register stay first-class on the platform.
2. **Verified against the live CAC registry**, never self-declared. A seller types in their RC number; the platform queries the CAC registry (or an authorized intermediary) and confirms the number resolves to an active registration whose director/signatory matches the seller's identity-verified name (mechanism #2).
3. **Distinct UI badge** from the existing "Verified" badge (which corresponds to mechanism #2, identity verification). The two are independent trust signals; a seller can be identity-verified without being CAC-registered.
4. **Build is deferred.** No schema, no API integration, no UI surface in Phase E. Will require its own banked design when the time comes (CAC registry access vendor, RC-number → director matching rules, badge UX, pricing if Pro-gated).

### Why the layered stack works in place of CAC

- The manual identity review (mechanism #2) catches the same harm CAC is sometimes proposed to address: ensuring a real Nigerian human is accountable for the listings. NIN + government ID + selfie + address establish that more directly than CAC does.
- The seller-WhatsApp OTP (mechanism #3) ensures the revealed contact is reachable.
- The RLS gate (mechanism #4) means unverified sellers are not visible to buyers — the trust promise to buyers is preserved without filtering on company-registration status.
- Per-listing moderation (mechanism #6, planned) + buyer reporting triage (mechanism #5 completion, planned) close the remaining loop: a verified seller behaving badly on a specific listing can be addressed at listing level, not just at account level.

### Operational consequences

- **Marketing/copy must not imply CAC registration is expected of sellers.** "Verified sellers" refers to mechanism #2, not CAC.
- **Onboarding flows do not collect CAC numbers.** No field, no schema column. (Confirmed via investigation: no `cac_number`/`rc_number`/`business_registration` column anywhere in the codebase.)
- **Investor/founder communications** should distinguish the platform's own CAC registration (SHOWMEPRICE-NG LIMITED) from sellers' status. The platform is registered so it can stand behind unregistered sellers, not so it can require them to register.
- **When pre-launch listings include a small number of formal businesses, that's fine** — they coexist with informal sellers, and the marketplace surface treats them identically (both subject to the same verification stack).

### Anti-pattern

> "We require sellers to be CAC-registered for trust."

This excludes the core Nigerian C2C market. It also confuses **registry membership** with **identity accountability** — the latter is what trust actually demands, and the manual verification flow already delivers it.

## D-135 — Referral / incentive approach: relational now, structured later

**Status:** Locked (2026-05-28)
**Cross-references:** D-088 (Founding Seller offer — first-100 perks already exist), D-114 (Anti-abuse operating policy), D-128 (Four-Phase Marketplace Lifecycle — Phase 1 Private Beta observation goals), D-129 (Payment Integration Sequencing — payment infrastructure dormant in Phase 1)

### Private beta (current phase per D-128) — no formal program

Phase 1 Private Beta operates on **relational incentives, not a structured referral mechanism.** Specifically:

- **Personal thank-yous** from Frank to early invitees who refer further invitees. No system mediates this — it's a relationship, not a feature.
- **Optional surprise airtime gifts** when an invitee meaningfully helps the platform (referring a successful seller, surfacing a useful bug, etc.). Surprise = deliberately not promised; the asymmetry is the point. No automation, no schedule, no entitlement.
- **Founding-seller status** as the early-join incentive: the first 100 verified sellers receive permanent founding badge + 6 months free Pro Seller (period starts at Phase F launch) + grandfathered ₦7,500/mo Pro Seller pricing for life. **This already exists in schema** — `businesses.is_founding_seller`, `founding_seller_granted_at`, `grandfathered_pro_price_kobo` (per D-088). Grants run at Phase F launch, not Phase E.

**Why no formal program now:** Phase 1's goal is **trust-recurrence observation**, not growth-hacking (per D-128's explicit Phase 1 anti-patterns). A structured referral program in this phase would:
- Optimize for referral throughput before we know whether the underlying experience is worth recommending.
- Create incentive structures we'd then have to maintain or unwind.
- Pull onboarding away from the small, controlled invitee cohort the phase requires.

### Post-beta — structured double-sided airtime referral (recorded as future design, not built)

When the platform transitions past Phase 1 (per D-128's transition criteria, observed not date-driven), a **structured referral program** ships with these shape constraints:

1. **Double-sided airtime reward.** Both the referrer and the new seller receive airtime when the referral genuinely activates. The amount is **left open** at banking — calibration depends on observed cost-per-quality-seller from Phase 1; sized later. Airtime (not cash, not credits) keeps the reward outside the payment infrastructure (per D-129 — payment integration sequencing) and within Nigerian network operator rails that all sellers can use.

2. **Activation-gated, not signup-gated.** Reward triggers only when the referred seller (a) phone-verifies, (b) passes manual identity verification (mechanism #2 from D-134), AND (c) lists their first product. Signup alone earns nothing — prevents fake-seller harvesting against the airtime budget.

3. **Anti-abuse — one reward per phone-verified seller.** Tied to the seller's verified Nigerian phone, not to email or device. A single phone number can be the *new seller* side exactly once across the platform's lifetime. The referrer side is also one-per-pair (no referring the same person twice across multiple devices). Anti-abuse posture per D-114.

4. **Build deferred.** No schema, no UI, no action code in Phase E. The first build needs its own banked design — referral codes / shareable links UX, airtime vendor (likely the same SMS provider rails or a dedicated airtime API), reward issuance lifecycle, abuse-monitoring queue, attribution model (last-click vs first-click), edge cases (refund / chargeback / suspended seller).

### Operational consequences

- During Private Beta, **resist** building referral infrastructure even when invitees ask for it. The right answer is "we'll send airtime when something meaningful happens; that's all we're promising right now." This preserves D-128's observation-not-growth posture.
- When designing the future structured program, **start with the activation gate** (mechanism #2 manual verification + first listing) and work backward into the UX — the gate is the load-bearing constraint, not the airtime amount or the share UI.
- The platform's existing `businesses.is_founding_seller` field is the only seller-incentive piece in schema. The future referral program will need new tables/columns; this is acknowledged future work.

### Anti-patterns

- "Refer 5 friends, get ₦5,000 airtime" — pre-launch growth-hacking, violates D-128 Phase 1.
- Referral rewards on signup completion alone — fake-seller harvesting attack vector, violates D-114 / D-114 anti-abuse model.
- Building a points/credits referral economy — pulls into payment infrastructure D-129 forbids in Phase 1.

## D-136 — City/area required at seller setup as a trust signal

**Status:** Locked (2026-05-28)
**Cross-references:** Sprint 3 / Gap D (original optional `businesses.city_area` introduction), ACTUAL_SCHEMA businesses notes (app-strict/DB-permissive split precedent on `products.city_area`), D-134 (Trust stack — supplements the verification mechanisms with an operational-location signal)
**Implementation:** Shipped in Stage C, commit `eba2497` — `becomeSellerAction` rejects empty `cityArea`; `BecomeSellerForm` drops "(optional)" label and adds the `required` attribute.

### The decision

The `city_area` field on the seller-setup form is **required** at onboarding. A seller cannot create their business without specifying where they operate from.

### Rationale

Buyer-facing trust is partly about reachability — "is this seller in my city / a city I can travel to / a delivery range that makes sense for the item." An unspecified `city_area` is a friction signal that contradicts the trust stack D-134 establishes. We collect it because buyers ask the question; the seller answers it once at onboarding rather than the platform leaving it blank.

This refines the Sprint 3 / Gap D framing where `city_area` was introduced as optional on `businesses` (with a "no banked requirement" comment in code). That framing is now superseded: the column stays nullable in the DB for legacy tolerance, but the seller-setup app path enforces it.

### App-strict / DB-permissive split

This decision deliberately uses the **app-strict / DB-permissive** pattern consistent with how `products.city_area` is handled in this codebase:

- **DB column:** `businesses.city_area` remains **nullable** (no NOT NULL constraint added). Legacy rows from before this decision are NULL and unaffected; backfill happens organically as those sellers re-edit their business.
- **App layer (`becomeSellerAction`):** required at onboarding. Empty → reject with field-level error before any DB write.
- **App layer (`BecomeSellerForm.tsx`):** `<Input required>` on the field. Label drops the "(optional)" suffix.
- **Future:** `updateBusinessAction` (manage-business view, where existing sellers edit their business) is **NOT yet aligned with this requirement** — it currently permits empty/blank `city_area` updates because the column is optional in that path. A small follow-up commit should tighten that to match the create-flow requirement, so existing sellers can't blank it back out. **Flagged as a follow-up**, not blocking.

### Why DB column stays nullable

- **Legacy tolerance.** Sellers from before this decision exist in production with `city_area IS NULL`. Adding NOT NULL would require a backfill migration with no good default value.
- **Operational reality.** Some seller types may legitimately not have a single "city / area" (multi-state distributors, etc.). The current product is Nigerian C2C focused; if such edge cases emerge, app-layer policy can flex without a schema change.
- **Same precedent.** `products.city_area` follows the same pattern per ACTUAL_SCHEMA — app-required on create/edit, DB nullable. Consistency reduces cognitive load for future readers.

### Anti-pattern

- Adding NOT NULL to `businesses.city_area` without a backfill plan — would error on the migration against legacy rows.
- Letting `updateBusinessAction` permit blank `city_area` indefinitely — undermines the create-flow requirement; **flagged as a follow-up to tighten**.

## D-137 — Verification sequencing gate: business details + verified WhatsApp before ID verification

**Status:** Locked (2026-05-28)
**Cross-references:** D-032 (Verification hard gate — RLS-based visibility), D-131 (Seller WhatsApp OTP-proven before revealable), D-134 (Trust stack — `city_area` + `state_id` as reachability signals), D-136 (`city_area` required at seller setup)
**Implementation:** Commit `6cef493`. Bundled in the same commit: a small `updateBusinessAction` fix closing the D-136 follow-up (existing sellers could previously blank `city_area` back out via the manage-business view).

### The decision

A seller cannot submit ID verification (the `/sell/verify` flow → `submitVerificationAction`) until both of the following are true:

1. **Business details are complete** — `businesses.business_name`, `businesses.state_id`, and `businesses.city_area` are all populated (non-null and non-empty).
2. **Seller WhatsApp is verified** — `businesses.seller_whatsapp_verified_at` is non-null (the verified-alternate-number path from D-131) OR the seller has explicitly chosen "use my verified profile phone" and `profiles.phone` is itself OTP-verified.

If either gate fails, the `/sell/verify` page redirects back to `/sell` with a toast (`verify-needs-business-details` or `verify-needs-whatsapp`) and the seller is signposted to the missing step.

### Three-layer enforcement

Defense-in-depth on the gate, mirroring the verification stack's general posture:

1. **UI checklist on `/sell`** — visible items show whether each prerequisite is met; the "Start verification →" / "Resubmit verification →" link is gated on the same condition so the link doesn't appear until the gates pass.
2. **Server redirect on `/sell/verify` page load** — the page itself reads the gate state and redirects to `/sell` with the toast if a prerequisite is missing. Catches the case of a direct URL hit (bookmarks, copy-pasted links from prior states).
3. **Action guard in `submitVerificationAction`** — the server action re-checks the gate before any insert into `seller_verifications`, returning a structured error if violated. Catches the case where the page redirect was bypassed (a stale tab whose form is submitted after the gate state has regressed).

All three layers read the same authoritative fields (`businesses.business_name`, `state_id`, `city_area`, `seller_whatsapp_verified_at`, and the verification-status / phone state used by D-131's WhatsApp fallback resolution).

### Rationale

Without the gate, a seller could submit ID verification with no city / no state / no reachable WhatsApp — and the admin could approve the submission (the manual review checks the identity documents, not the business fields). The seller would then be `'verified'` and their listings public, but with no operational location and no buyer-reachable contact. That breaks the trust-stack contract D-134 establishes:

- Mechanism #2 (manual identity verification) succeeds.
- Mechanism #3 (seller WhatsApp OTP) is missing — the revealed contact at reveal time is whatever fallback resolves, possibly nothing usable.
- Mechanism #4 (RLS public-listing gating) flips the seller's listings live, including listings with no operational city signal.

The right place for this gate is **before** ID verification submission, not as a soft validation at admin-review time, because:

- Admin reviewers should be evaluating identity-document evidence, not chasing missing operational fields.
- A rejected verification for "missing city / unverified WhatsApp" is a worse seller experience than a clear pre-submission checklist saying "complete these first."
- The fields the gate checks are seller-self-serve; admin can't fix them on the seller's behalf without violating the D-138 profile-lockdown (the WhatsApp path requires the seller's own OTP). Putting them at admin-review time would create a class of submissions that admin can't approve.

### Bundled D-136 follow-up: `updateBusinessAction` city_area tightening

D-136 originally flagged that `updateBusinessAction` (the manage-business / "edit your business" path) permitted blank `city_area` updates because the DB column is nullable. The verification sequencing gate would be undermined if existing sellers — having passed the gate once — could later blank `city_area` back out via the manage-business view and reach a state where the gate would no longer pass on a re-submission. Same commit closes this: `updateBusinessAction` now rejects empty `city_area` in updates, matching the create-flow strictness from D-136.

### Operational consequences

- **Banner pattern on `/sell`** — the existing "verify WhatsApp" recovery banner (`SellerWhatsappRecoveryBanner`, from `1e8d217`) is the surface the gate signposts to. The banner exists to close the dead-end where a seller had a degraded WhatsApp state with no recovery path; D-137 makes that banner load-bearing for the verification sequence.
- **Toast keys** — `verify-needs-business-details` and `verify-needs-whatsapp` are registered in `toasts.ts`. New toast keys for future gate variants (e.g. "verify-needs-X") follow the same `verify-needs-…` naming.
- **Gate condition lives in one place per layer.** The gate is expressed as a function over the seller's current state; future additions (extra prerequisites, e.g. profile-photo-required, payment-detail-required) extend that function, not by adding parallel checks in each of the three layers.

### Anti-pattern

- Moving the gate to admin-review time. Violates the rationale above; admin reviewers end up doing operational-field chasing instead of identity evaluation.
- Adding a fourth enforcement layer (e.g. a DB trigger on `seller_verifications` insert). The three layers (UI / page redirect / action guard) already cover the realistic failure modes; a DB trigger would duplicate the action-guard check without adding meaningful protection, at the cost of forcing the gate condition to be expressible in SQL only (and tracking schema drift across two implementations).
- Soft-gating with a warning instead of a hard block. The seller can choose to ignore a warning; the consequence is broken sellers in production. Hard gate, signposted recovery.

## D-138 — Profile column lockdown (E.2.14.0): DB-enforced freeze on protected identity + monetization columns

**Status:** Locked (2026-05-28)
**Cross-references:** D-017 (Trigger-protected column pattern — `businesses.verification_status` precedent), D-105 (Admin-bootstrap GUC bypass pattern for SECURITY DEFINER admin operations), D-083 (`signup_free_reveals_remaining` — buyer reveal accounting), D-084 (Pro activation timestamp), D-133 (Beta lifetime free-reveal grant — default 1 → 3), K-066 (Production phone-verify path — must not break), K-021 (`freeze_profile_role` search_path pinning — deferred)
**Implementation:** `migrations/E.2.14.0-freeze-profile-protected-columns.sql` (applied 2026-05-28) + commit `3d5ee88`. Bundled fix in the same migration: `profiles.signup_free_reveals_remaining` default `1` → `3` per D-133.

### The decision

The following eight `profiles` columns are DB-enforced as write-protected via a new `BEFORE UPDATE` trigger `profiles_freeze_protected` (function `freeze_profile_protected_columns`). Owner and admin direct UPDATEs to any of them raise `42501` with a specific message naming the column:

1. **`display_name`** — permanently frozen. Set at signup; cannot be changed by anyone, including the owner, including admin. The settings page surfaces this as "Set at signup; cannot be changed."
2. **`phone`** — admin-only via SECURITY DEFINER RPC. Owner-facing settings copy: "Contact support to change your phone number." The RPC (`admin_change_user_phone`, E.2.16.0) is the one path that bypasses; it sets the GUC, writes the new phone, atomically strips `'phone_verified'` and `_phone`-suffixed `auth_providers`, and audits.
3. **`tier`** — system-only. Future Paystack-webhook RPC writes this; no owner / admin manual path until that RPC ships.
4. **`tier_started_at`** — system-only (same as `tier`).
5. **`tier_expires_at`** — system-only (same as `tier`).
6. **`signup_free_reveals_remaining`** — system-only. Future reveal-action decrement RPC will set the bypass GUC; no other path writes this column. (Bundled default change from `1` to `3` per D-133 — beta lifetime grant — applies to new INSERTs only; existing rows unaffected.)
7. **`pro_activated_at`** — system-only.
8. **`is_disabled`** — admin-only via future account-suspend RPC (Stage 2 of admin tools per D-139). Until that RPC ships, this column is unwritable by anyone except the postgres role / service_role with the bypass GUC set inline.

The bypass mechanism is a transaction-local GUC `app.profile_system_write_authorized` consumed by the trigger via `current_setting('app.profile_system_write_authorized', true)` (second-arg `true` returns NULL when missing, NULLIF + COALESCE coerces NULL to false). The GUC mirrors the E.2.2.0 `app.role_change_authorized` pattern — set LOCAL inside legitimate SECURITY DEFINER RPCs, dies at COMMIT/ROLLBACK, not exposed via PostgREST.

### Deliberately NOT locked

Equally important — the columns the trigger DOES NOT cover, and why:

- **`verification_status` + `auth_providers`** — the live `mark_phone_verified` RPC writes both columns and does NOT set the bypass GUC. Including them in the freeze would break K-066 (the production-critical phone-verify path). Hardening these is a deferred follow-up: either `mark_phone_verified` is taught to set the GUC, or the freeze condition learns to discriminate "legit append-only updates" from "owner manipulation." Until then, the operational discipline is that these columns have a single live writer (`mark_phone_verified`), and any future writer must be added to MEMORY first.
- **`user_type`** — the legit buyer-to-seller upgrade path (`becomeSellerAction`) writes this column from `'buyer'` to `'seller'` via owner-driven action. Locking it would break seller onboarding.
- **`last_seen_at`** — frequent legit messaging writes; locking it would cause continuous freeze-trigger noise without trust benefit.
- **`state_id`** — settings-page editable when introduced (buyers update their state when they move). Admin-only path also exists via `admin_change_user_location` (E.2.16.0) for support-driven updates, routed through audit for consistency even though no DB lock requires it. **Asymmetry alert — `state_id` is the one field currently locked only at the UI layer.** The settings page (`77ce57d`) renders "Contact support to update your location" with no edit form, but the DB column remains owner-writable under the existing `profiles` RLS — the lock today relies on the absence of an edit form, not on the freeze trigger. This is acceptable while the settings page has no state edit UI; **if and when the settings page gains an owner-driven state edit form**, `state_id` MUST be moved into the freeze trigger first (so the owner-edit path goes through a SECURITY DEFINER RPC that sets the bypass GUC, matching the pattern for every other lockdown column). Until then, this asymmetry is the single instance where UI absence is the only barrier — flagged explicitly here so it does not silently degrade.
- **`handle`** — settings-page editable when introduced (future feature).
- **`avatar_path`** — settings-page editable when introduced (future feature; current settings hub ships initials-only).
- **`full_name`** — settings-page editable when introduced (legal-name field distinct from `display_name`).
- **`role`** — already protected by the pre-existing `profiles_freeze_role` trigger (E.2.2.0). The new lockdown deliberately does not duplicate that protection. K-021 (search_path pinning for `freeze_profile_role`) remains deferred.

### Trust-thesis rationale

The settings page after `77ce57d` makes specific claims to the user — "Set at signup; cannot be changed", "Contact support to change your phone number", "Contact support to update your location" (note: location is locked at the UI layer, not DB, see Deliberately NOT locked above). Until E.2.14.0, those claims were enforceable only by the absence of an edit form — any path with `rpc()` access (including the user's own authenticated session via the JS client) could mutate `display_name` / `phone` / `tier` / `is_disabled` directly. The settings copy was UI theater; the actual write-protection layer was the absence of code that called the writes.

E.2.14.0 makes the settings page's claims true at the DB layer. A buyer who tries to `rpc()` a `display_name` update from their browser console hits `42501` from the trigger, not a "endpoint not implemented" 404 from the absence of UI. That's the contract trust-thesis requires.

This is the same principle as D-017's `freeze_business_verification` trigger (which makes "only admin can verify a business" true at the DB layer, not just the admin-UI layer) and E.2.2.0's `freeze_profile_role` trigger (which makes "only existing admins can grant admin role" true at the DB layer). Three triggers, same posture: claims about who can write what live in trigger code, not in UI absence.

### Defense-in-depth posture

The freeze trigger is the **last line**, not the only one. The full posture for any column the lockdown covers:

1. **No UI affordance.** The settings page has no edit form for these fields.
2. **No app-layer write path.** No server action / RPC client call writes these fields outside the explicitly-banked SECURITY DEFINER RPCs.
3. **DB-enforced freeze** (this decision). Catches the case where a malicious or buggy caller bypasses (1) and (2).
4. **Bypass requires LOCAL GUC + SECURITY DEFINER ownership.** The bypass key `app.profile_system_write_authorized` is set only inside `postgres`-owned SECURITY DEFINER functions, and only LOCAL — it dies at transaction boundaries and cannot leak between calls.
5. **Bypass-using RPCs are themselves ACL-locked.** Per the MEMORY lesson on Supabase default function ACL, the RPCs that set the bypass are `REVOKE EXECUTE`'d from `PUBLIC` + `anon` + (where appropriate) `service_role`, with `GRANT` to only the role that legitimately invokes them.

### Bundled D-133 default fix

`profiles.signup_free_reveals_remaining` default changed from `1` to `3` in the same migration. Per D-133, private beta = 3 free contact reveals per buyer, lifetime. The default was wrong (`1`) since E.2.0.0; the live test profile surfaced this. Default change applies to new INSERTs only; existing rows are unaffected (no backfill — beta is small enough that the affected cohort can be re-granted manually if needed, and most production rows post-this-fix will be new signups).

### Anti-pattern

- Adding new columns to the freeze without inventorying writers. A surprise lockdown that breaks a live RPC is worse than no lockdown. Process: before adding a column to the trigger, grep the codebase for all current writers, confirm each is either (a) a SECURITY DEFINER RPC that will set the bypass or (b) a path that should now be blocked.
- Setting the bypass GUC at session scope (without `LOCAL`). Would leak across statements within the same Editor session and create accidental-bypass risk. The `set_config(..., true)` third-arg `true` enforces LOCAL — never drop it.
- Exposing a `public.set_profile_system_write_authorized()` wrapper through PostgREST. Would re-open the bypass to any session that holds EXECUTE on the wrapper. `set_config` lives in `pg_catalog` (not exposed via REST), and no public wrapper exists — keep it that way.

## D-139 — Stage 1 admin tools scope: phone + location change, with deferrals named

**Status:** Locked (2026-05-28)
**Cross-references:** D-105 (Admin role provisioning audit precedent — same RPC shape and lockdown discipline), D-138 (Profile column lockdown — the freeze trigger that Stage 1's phone-change RPC bypasses), D-081 (Admin-model unification deferred to Phase F+), K-004 (Account deletion — RESTRICT FK reality requires soft-delete-PII-scrub design)
**Implementation:** `migrations/E.2.15.0-profile-admin-changes-audit.sql` (audit table) + `migrations/E.2.16.0-admin-profile-change-rpcs.sql` (two SECURITY DEFINER RPCs) + commit `4abe364` (admin UI: `/admin/users` search + `/admin/users/[id]` detail page + two action forms + user-notification email dispatcher).

### What Stage 1 builds

The admin support surface needed to fulfill the settings-page promises the user sees ("Contact support to change your phone number / location"):

1. **Admin user search** (`/admin/users`) — search any user by name, email, or phone (with `normalizeNigerianWhatsApp` pre-normalization for phone-substring matching). Returns full directory: includes admins, includes disabled accounts. Distinct from `/admin/staff` which lists admins-only for the grant-role flow.
2. **Admin user-detail page** (`/admin/users/[id]`) — read-only display of the user's current state (display_name, email, phone with verified badge, current state, role badge, disabled badge, joined date) plus recent admin-action history from `profile_admin_changes` (limit 5, ordered newest-first). Two action forms inline.
3. **`admin_change_user_phone` RPC** (E.2.16.0) — SECURITY DEFINER, GUC-bypass-protected, audit-writing. Validates caller is admin (42501), reason length 5–500 (22023), phone format `^234\d{10}$` (22023). Idempotent on same value. Atomic UPDATE writes new phone + strips `'phone_verified'` from `verification_status` + strips `_phone`-suffixed entries from `auth_providers` + bumps `updated_at`. UNIQUE violation re-raised as 23505 with clearer message. Audit row written with `action='phone_changed'`, previous/new values, reason. ACL: `REVOKE FROM PUBLIC + anon + service_role`, `GRANT TO authenticated` (the in-function `is_admin` check is the real gate).
4. **`admin_change_user_location` RPC** (E.2.16.0) — same authz + reason gates. State existence validated up-front (P0002). NULL-safe idempotency via `IS NOT DISTINCT FROM`. No bypass GUC needed (state_id is NOT in the E.2.14.0 freeze list); routed through this RPC purely for audit consistency. Audit row written with `action='location_changed'`, previous/new = state name (human-readable, not uuid).
5. **User-notification email** (`dispatchAdminProfileChangeNotification`) — sent to the affected user after either RPC succeeds. Subject: "Your ShowMePrice account was updated by support". Body: factual statement of which field changed + recovery CTA ("If you didn't request this change, please reply to this email immediately"). Phone variant additionally notes the verified-status revoke. Fire-and-forget; never throws (mirrors `dispatchVerificationDecisionEmail`). `event_type=NULL` in `notification_log` (welcome-precedent — outside user-facing notification taxonomy, no opt-out — security/recovery class).

Twelve live-fire control tests (positive + four negatives + idempotency for each RPC, all ROLLBACK-wrapped) verified the RPCs end-to-end before app code shipped.

### What's deferred and why

The original draft scope for "Stage 1 admin tools" was broader. The deliberate trim:

- **Account suspension** — deferred to **Stage 2 admin tools**. Bare `is_disabled` flip is not enough; the design needs (a) middleware login-gate so a suspended user can't continue to act on stale session, (b) listing-visibility transition (do their listings hide on suspend? on suspend duration ≥ N? immediately?), (c) communication policy (does the suspended user receive an email? are their open conversations frozen?). Needs its own banked design pass before implementation; not blocking Stage 1's correctness gap.
- **Email change** — deferred. Touches `auth.users` via the Supabase admin SDK, not just `profiles`. Different code path entirely (not a `public.fn()` RPC), different recovery posture (changing email invalidates magic-link recovery, requires re-confirmation), different abuse surface (mass-email-takeover via compromised admin account is much higher impact than mass-phone-takeover). Out of Stage 1 scope.
- **Deletion processing** — deferred (K-004 stands). The `RESTRICT` FK posture on `messages` / `conversations` / `orders` / `contact_reveals` / `price_history` is intentional — those rows are evidence and accounting, not orphanable. Real deletion needs a soft-delete-PII-scrub design (anonymize `display_name`, null `phone`, retain referential integrity) rather than naive row delete. Out of Stage 1 scope.
- **Consolidated `admin_action_log` coverage across all admin actions** — deferred. The codebase has three separate audit tables today: `admin_action_log` (originally intended as the unified log, but blocked by the `admins`-entity FK), `admin_role_changes` (E.2.2.0, purpose-specific to avoid the `admins`-FK dependency), and now `profile_admin_changes` (E.2.15.0, same rationale). The unification is gated on D-081 (admin-model unification deferred to Phase F+); until then, each purpose-specific table is the right pragmatic shape. Banked as a known gap.

### Rationale for the deferrals

Stage 1 closes a **specific live correctness gap**: the settings page (`77ce57d`) makes promises ("contact support to change your phone / location") that, until Stage 1, had no admin tool to fulfill. A user who hit "I need to change my phone" had no path; admin had no path either short of direct SQL. Stage 1 closes that gap with the minimum viable admin surface.

Each deferred item adds **a design question that's harder than the build**, and entangling them with Stage 1 would delay the live-correctness fix while we work through the harder design. Specifically:

- Account suspension needs the session/visibility/communication design (above) — that's a feature-design question, not a coding question.
- Email change needs the `auth.users` write path + recovery-flow rethink — different code path, different design.
- Deletion needs the soft-delete-PII-scrub design — different code path, different design, K-004 known.
- Audit unification needs the admin-model unification decision — D-081 deferred for explicit Phase reasons.

Each will get its own banked design + scope when the next stage warrants it. The deferrals are not "we didn't have time", they are "we don't yet know the right shape, and shipping a wrong shape would be worse than shipping nothing."

### Operational consequences

- **Stage 1 RPCs are called via the `authenticated` session client**, not `service_role`. The in-function `is_admin(p_granter_id)` check is the real authorization; `p_granter_id` is always `auth.userId`. This is a **deliberate departure** from `mark_phone_verified`'s `service_role`-only posture (which exists because that RPC is called from a `service_role`-authenticated server context). Document for future maintainers: the choice of which role to GRANT EXECUTE to is per-RPC, driven by what client the app will call it from.
- **The "fire-and-forget email after RPC success" pattern** is now precedent-set across three dispatchers: `dispatchVerificationDecisionEmail` (verification approve/reject), `dispatchAdminVerificationSubmissionEmail` (admin notification on submission), `dispatchAdminProfileChangeNotification` (this one). Future admin actions that affect a user follow this shape — outer try/catch/swallow, never throws, always logs to `notification_log`, falls back to in_app log when Resend isn't configured.
- **The "rich audit row" pattern** — `previous_value` + `new_value` as human-readable text — is precedent for future audit rows. State names not state UUIDs; canonical phones not formatted phones. The admin user-detail page renders these directly; readability at audit time matters more than re-parseability.
- **Idempotency returns `false` from the RPC** and the action surfaces this as a distinct toast (`phone-unchanged` / `location-unchanged`). Not an error, not a silent success — a third state the operator can see. Future admin RPCs follow the same convention.

### Anti-pattern

- Cramming account-suspend / email-change / deletion into Stage 1. Each has design questions Stage 1 doesn't answer. Shipping the wrong design is worse than shipping nothing.
- Using `service_role` to call `admin_change_user_phone` from the app, bypassing the in-function `is_admin` gate. The RPC was deliberately designed for `authenticated`-role call paths; service_role would skip the authorization layer that's the entire reason the RPC exists.
- Adding a "soft email change" via a separate `auth.users` write path without thinking through magic-link recovery, password-recovery email, and confirmation re-flow. Email is identity in Supabase Auth in a way phone isn't; the design is meaningfully harder.
- Naive `DELETE FROM profiles WHERE id = …` for account deletion. RESTRICT FKs will raise; even if they didn't, deleting the referent of `contact_reveals` / `messages` / `price_history` rows destroys evidence the marketplace's trust posture depends on. K-004 holds for a reason.

## D-140 — Category restriction shape updated: denylist (4 hard-closes) replaces 4-family allowlist; vehicles + property opened pre-Level-3

**Status:** Locked (2026-05-29)
**Cross-references:** D-116 (Tiered listing access — verification level × category risk; consciously updated by this decision), D-091 (Phase E "unlimited listings" framing), D-032 (verification gate), D-112 (honest verification labels), D-128 (Phase 1 Private Beta — observation over growth-hacking), D-134 (trust stack)
**Implementation:** `src/lib/categories.ts` — `LAUNCH_CATEGORY_SLUGS` (20-slug allowlist) replaced by `RESTRICTED_CATEGORY_SLUGS` (denylist of 7 slugs covering 4 hard-closed category families); `isLaunchCategory()` flipped to `!denylist.includes(slug)`. Two server-side enforcement points in `src/app/(auth)/actions.ts` (`createListingAction` + `updateListingAction`) get a clearer error message at the same lines but otherwise unchanged.

### Context

The original Phase E launch-category allowlist restricted listing creation to four category families — phones, computers, electronics, power & generators (20 slugs total). That allowlist was the right shape for a single-seller smoke test of the pipeline. With three verified sellers now live and referrals arriving across multiple categories (Fashion was the immediate trigger), the allowlist is materially blocking growth that the trust stack (D-134) is otherwise ready to support.

D-116 (2026-05-22) banked a tiered seller-verification model (L1 / L2 / L3) under which `vehicles` and `property` are reserved for Level 3 — Business Verified (CAC-checked). That verification-level model is **explicitly future engineering** per D-116's own "Implications (future engineering, NOT this commit)" note. It has not been built.

### Decision

Replace the allowlist with a small, regulator-and-safety-shaped denylist. Open everything else, including `vehicles` and `property`, ahead of D-116's tiered model.

**Four hard-closed category families (7 slugs total):**

1. **Alcohol** — `drinks` parent (closed to push specificity) + `alcohol-spirits`, `wine`, `beer`. Non-alcoholic drinks subcategories (`soft-drinks`, `juices`, `water`, `coffee-tea`) remain open via their own slugs.
2. **`health`** — single slug; no subcategories exist in the taxonomy today.
3. **`pets`** — single slug; no subcategories.
4. **`services`** — single slug; no subcategories.

The function signature `isLaunchCategory(slug: string): boolean` is kept (two call sites already use it); only its semantics flip — true now means "open for listing," false means "in the denylist."

### Rationale

**Why open vehicles and property despite D-116:**

D-116 reserved them for Level 3 because the verification-level model is the right shape *in the abstract*. But that model has not been built and is not on the near-term roadmap. Blocking real seller growth on architecture that doesn't exist yet creates more cost (lost trust with seller cohort, repeated "contact support" escalations, brand friction at the worst stage) than the policy prevents. Three verified sellers — vouched for personally per the Phase 1 / D-128 relational-trust posture — are the population this affects today.

If/when D-116's tiered model ships, `vehicles` and `property` can be re-gated then (it would be additive on top of, not in place of, this list — high-risk-category × low-verification-level can fail at submission even when neither rule alone blocks). D-116 is not abandoned; it is acknowledged as still-future and deliberately not blocked-against in the interim.

**Why the four chosen closures stay closed regardless of D-116:**

Each of the four denylist categories is shaped by a reason that doesn't depend on verification tiers and won't go away when D-116 ships:

- **Alcohol** is gated by NAFDAC + Nigerian state liquor laws on **age-of-buyer**, not on seller credentials. A CAC-verified seller is not licensed to sell alcohol to a minor without age verification at point of sale. The platform has no age-gate; until one ships, alcohol stays closed. (When the day comes that an age-gate exists, the same denylist mechanism + a separate `age_restricted` flag can open the category.)
- **`health`** is gated by NAFDAC pharmaceutical regulation, which is a regulator-licensed-seller question, not a verification-level question. Counterfeit drugs is a known Nigerian fraud vector that a buyer-facing trust badge does not mitigate.
- **`pets`** carries wildlife-trafficking exposure (CITES + the Nigerian Endangered Species Act) and live-animal welfare moderation that a verification level does not address. Exotic-species scams attract this category specifically.
- **`services`** is a categorical mismatch — services aren't products, and "DM for price" is the user pain ShowMePrice exists to remove. Fake-job / "investment opportunity" scams cluster in this category. A separate services surface, if ever designed, would have its own scope and own design.

These four are not "Level 3 reserved" — they're "out of scope for this platform's current trust mechanisms regardless of seller verification level."

### Operational consequences

- **Frontend was already showing all 108 categories in the listing-creation dropdown** (no UI-side filter); the seller sees no change there. The change is at submit time — categories that used to fail with the launch-allowlist error now succeed (if they're not on the denylist) and the four denylist categories fail with a clearer "requires additional seller verification" message.
- **Marketplace / `/categories` / homepage discovery surfaces are unchanged.** They already render all 108 categories regardless of the listing-creation restriction; investigation confirmed zero references to `isLaunchCategory` outside the two action call sites. Newly-opened categories become populated naturally as sellers post; the four closed categories stay browsable (the empty-state shows "no verified listings yet in this category" as before).
- **Per-category spec schemas (`src/lib/categorySpecs.ts`) are opt-in** — categories without a schema entry render without the "Details for this category" fieldset. Fashion already has a schema (size + color, both optional). Categories without a schema (Hair & Wigs, Beauty, Home & Furniture, Baby & Kids, most Tier 2 & 3) get a clean form with no extra fields. No category breaks on opening.
- **Error message standardized at both call sites** (createListingAction + updateListingAction) — *"This category requires additional seller verification and isn't available yet. Contact support if you need to list here."* — replaces the prior listing-launch-categories enumeration that's now stale.
- **D-116 is not abandoned.** The tiered verification model is still the right long-term shape for `vehicles` and `property` specifically; this decision just declines to gate on architecture that has not been built. When D-116 ships, the tier check layers on top of this denylist (additive, not replacement).
- **Long-term migration path remains documented in code.** The deprecation note in `categories.ts` carries forward — the hardcoded denylist is interim; the eventual home is `categories.category_features` JSONB (column already in schema; the long-term flag shape `{"phase_e_listable": false}` was already named in the original deprecation note and remains right). When that migration ships, the constant and `isLaunchCategory()` retire in favour of a data-driven per-row check.

### Anti-pattern

- Opening **alcohol** without an age-gate. Alcohol's gate is age-of-buyer, not seller-of-record. Adding alcohol to the open set on the assumption that "verified sellers are responsible" mis-identifies which party the regulation is protecting.
- Opening **`services`** because "we want more supply." Services don't fit the product-with-real-price thesis; opening them quietly muddies the marketplace identity and pulls moderation effort onto fake-job / investment-opportunity surfaces that have nothing to do with the founding pain.
- Re-introducing an allowlist when the next category needs to open. The allowlist shape was the original mistake — it required a code edit per new opening. The denylist + future JSONB-flag path means "open by default" is the normal case and closures are the exceptions, each with a banked reason.
- Treating D-116 as either fully-binding or fully-abandoned. The right framing is "future engineering, not blocked-on, layered-on-top-of when it ships." This decision picks that middle.

## D-141 — Universal quantity per listing; category-aware visibility; manual seller-managed; status and quantity are orthogonal

**Status:** Locked (2026-05-29)
**Cross-references:** D-129 (Payment integration sequencing — no purchase events on the platform yet, so no auto-decrement source of truth), D-140 (Category restriction shape — `pets`/`services` closed but pre-seeded as `supports_inventory=false` for forward compatibility), Sprint 3 / Gap B (`setListingStatusAction` — seller-driven sold/reactivate lifecycle), E.2.13.0 (`products.hidden_at` — admin moderation; orthogonal to both status and quantity)
**Implementation:** `migrations/E.2.17.0-inventory-quantity.sql` (applied 2026-05-29) + commit `<this>`. Step 2 (app code — validators, action parsing, conditional form rendering, badges across public detail / dashboard / marketplace) ships separately.

### Context

A verified fashion seller surfaced two related gaps: (1) buyers have no way to know when an item is sold out, and (2) sellers have no way to indicate how many of an item they have. The current product model carries `status` (draft/active/sold/archived) but no quantity concept. Decision arrived at on the Frank side: ship Shape A — quantity per listing, universal across categories — not variant-level inventory (e.g. no per-size stock for fashion in v1).

### Decision

**Add `products.quantity` as a NOT NULL DEFAULT 1 integer column, with a CHECK ≥ 0 constraint, and gate its UI visibility by a new `categories.supports_inventory` boolean (default true, false on 7 enumerated slugs).**

**Single source of truth:** `quantity` is the live stock signal. `quantity = 0` means out of stock (UI surfaces an "Out of stock" badge); `quantity > 0` means available. There is no separate `is_in_stock` flag — the integer is enough.

**Category-aware visibility, not category-aware storage:** the `quantity` column exists on every product row regardless of category. The category flag (`supports_inventory`) controls whether the field is **shown** in the listing form and whether the badge is **rendered** on public surfaces — not whether the column has a value.

**Seven categories carry `supports_inventory=false`:**
- Single-instance vehicles: `vehicles` (parent), `cars`, `motorcycles`, `tricycles` — each row is a specific vehicle, not a unit. `vehicle-parts` deliberately stays `true` (NG parts vendors stock multiple identical units; matches Jiji / other major platforms).
- Single-instance: `property` — each property is a specific instance.
- Pre-seeded for forward compatibility: `pets` and `services` (closed per D-140 today; if/when either opens, the UI policy is already correct on day one — `pets` because each animal is unique, `services` because services aren't products and have no inventory concept).

All other ~101 categories default to `supports_inventory=true` via the column default.

### Why this shape

**Why a boolean column on categories, not `category_features` JSONB:**

The existing `category_features` JSONB column (Phase E.1.0) is for runtime UI tunables — warning banners, high-value markers, per-category required-field hints. `supports_inventory` is a different shape: a hard schema-level capability switch read on every listing-form render and every public-detail render. Reasons against JSONB here:

- Frequent-path read. Boolean column lookup is cheaper than `category_features->>'supports_inventory'` JSONB extraction on every render.
- Type safety. Drizzle treats the column as `boolean`; the JSONB path requires null-vs-missing handling and runtime coercion.
- Semantic clarity. "Does this category have stock at all?" is a schema-shape decision, not a runtime UI tunable.

The JSONB path stays right for `warning_banner`, `high_value`, etc. that genuinely vary per row and are display-only.

**Why NOT NULL DEFAULT 1 (not nullable with NULL = N/A) on `products.quantity`:**

The category flag is the source of truth for "show or hide the quantity UI". The value itself never needs a null sentinel because the visibility decision happens upstream. Choosing NOT NULL DEFAULT 1:

- Render code reads `product.quantity` without null-check on every detail / card / dashboard path.
- Backfills existing rows to 1 immediately and semantically (the handful of existing listings each represent "the seller has 1 of this item" — accurate by construction).
- Defense in depth: if a row ever ends up in a non-inventory category with `quantity = 0` (e.g. cross-category edit), the UI still ignores it because `category.supports_inventory = false`.
- Migration is one ALTER with an immediate backfill; no two-step "add nullable, backfill, ALTER NOT NULL" dance.

The CHECK ≥ 0 prevents negative values at the DB layer.

**Why `status` and `quantity` are orthogonal:**

`status` (product_status enum: draft / active / sold / archived) is **seller intent** — "I want this listing live" vs. "I'm done selling it". `quantity` is **current stock count** — "I have N right now." Conflating them (auto-setting `status='sold'` when quantity hits 0) would destroy the buyer-browsability case: a fashion seller restocking next week wants buyers to still see the listing with an "Out of stock" badge, message about availability, and see their other items.

- `setListingStatusAction` (Sprint 3 / Gap B — sold-or-reactivate) remains the seller's explicit lifecycle control.
- `quantity` remains the live stock signal.
- `hidden_at` (E.2.13.0) is a third orthogonal axis owned by admin moderation.

Three independent dimensions, three independent change controls. Out-of-stock listings stay `status='active'`; the public-read RLS continues to surface them; the UI layer renders the "Out of stock" badge.

**Why RLS is not touched:**

`products_public_read_active` filters on `status = 'active' AND hidden_at IS NULL`. Because out-of-stock listings stay status='active' (per the orthogonality above), they remain visible to buyers. The "Out of stock" badge is purely a UI layer on top of the existing visibility policy. No policy changes; no migration to existing policies.

**Why manual seller-managed (no auto-decrement):**

The platform has no purchase events today — D-129 (payment integration sequencing) defers checkout/sale infrastructure to public-launch. Without a sale event, the only honest source of truth for stock is the seller's own action. Auto-decrement would require either (a) checkout that doesn't exist, or (b) treating contact-reveal as a proxy for sale (wrong — buyers reveal contact then don't buy all the time). Seller manually updates.

### Operational consequences

- **Step 2 app code (separate commit) carries:** `validateQuantity()` validator + `quantity?: string` on `ListingValidationErrors`; quantity parse + persist in `createListingAction` + `updateListingAction`; conditional `<QuantityField>` block in `NewListingForm` + `EditListingForm` (rendered based on the selected category's `supports_inventory`); "Out of stock" badge on the public detail page, the seller dashboard overlay, and the marketplace card overlay (mirroring the existing "Sold" overlay pattern).
- **Step 2 also lands "Mark as sold out" / "Mark as available" quick-action buttons** on the seller dashboard listings list (one-click `quantity = 0` / `quantity = 1` for fast UX) — pure UI on top of the data model, no schema impact.
- **Existing 5 products backfilled to `quantity = 1`** — semantically "seller has 1 of this item." Sellers can edit upward via the listing edit page once Step 2 ships. Per-seller out-of-band communication (WhatsApp) recommended ahead of the Step 2 deploy so sellers know to populate the new field on multi-quantity listings.
- **`vehicle-parts` stays `supports_inventory=true`** — the explicit departure from the `vehicles` family. Captured in the seed + the migration's UPDATE deliberately omits the slug. If a future Nigerian parts subcategory pattern emerges where a specific used-part is a single instance, the row's flag can flip; the shape supports it.
- **The "Mark as sold out" UX semantic is `quantity = 0`, NOT `status = 'sold'`.** They are different actions. `setListingStatusAction` (Gap B) is the seller saying "I'm done with this listing entirely" (final). `quantity = 0` is "I'm temporarily out; restocking" (transient). Future-you reading the seller dashboard code six months from now needs to keep the two affordances visually distinct.
- **No reservations / holds / cart semantics in v1.** Quantity is a count, not a reservation system. Buyer A and Buyer B can both see "5 available" and both message the seller; the seller handles which sale completes. Adding reservation logic requires checkout infrastructure (D-129) and timeout management — out of scope for E.2.17.0 + its Step 2.

### Anti-pattern

- Auto-decrementing `quantity` on contact-reveal or message-send. Reveals and messages are intent signals, not sales. Auto-decrement on either would corrupt the stock signal (buyer reveals, doesn't buy → seller's "available" count is wrong; multiplied by the realistic conversion rate, the column becomes meaningless within a week).
- Conflating `quantity = 0` with `status = 'sold'`. Two different seller intents (transient restock vs. permanent end-of-listing). A "mark sold out" button that flips `status` instead of `quantity` would force re-listing every time the seller restocks — a huge UX regression for fashion / electronics / generators sellers who turn over inventory regularly.
- Adding `quantity` to the `marketplace` filter ("only show in-stock"). Out-of-stock listings stay visible by design — buyers still want to see the seller's range, message about availability, see related items. A filter could land in Step 3+ as an explicit user-toggleable preference, but it's not a default-on behavior.
- Treating `supports_inventory=false` rows as "no quantity column" — the column exists universally and is queryable; non-inventory categories just ignore it in the UI layer. Code that special-cases storage by category invites schema drift.
- Building variant-level inventory (per-size stock for fashion, per-color stock for phones) in v1. Shape A is universal quantity across categories. Variant inventory is a separate, harder design pass requiring schema for variants + per-variant stock + variant-aware listing forms. Not blocked-against; not built now.

## D-142 — Seller shop pages at `/sellers/[slug]`: public storefront foundation with business slug + business-avatars storage bucket

**Status:** Locked (2026-05-29)
**Cross-references:** Phase E.1.0 (`businesses.slug` + `businesses.logo_path` columns added anticipating this build — ACTUAL_SCHEMA banking note explicitly named "the not-yet-built public storefront"), D-032 (verification gate — only verified businesses surface), D-091 (verification-tier × listing model), D-112 (honest verification labels), D-131 (seller WhatsApp OTP-proven before revealable), Phase D.6 (marketplace card density — no seller name on cards), Phase D.2 (`product-images` bucket precedent — owner-write / public-read), Phase C.5 (`verification-id-documents`/`-selfies` private-bucket precedent — opposite trust model)
**Implementation:** `migrations/E.2.18.0-business-slug-backfill-and-avatars.sql` (applied 2026-05-29) + commit `<this>`. Step 2 (app code) ships separately: `generateBusinessSlug()` helper, `/sellers/[slug]/page.tsx` shop page, `BusinessAvatarUploader.tsx` client component, dashboard avatar widget, link integration from listing detail page seller card.

### Context

Every verified seller needs a public storefront URL — a landing page where buyers see the business name, verified badge, location, member-since date, active listings count, business avatar/logo, and the full grid of their active listings. This is the foundational missing piece between "listing detail page" (one product) and "marketplace" (all products) — the **per-seller** browse surface that lets buyers discover a seller's range after engaging with a single listing.

The columns to make this work were banked at Phase E.1.0: `businesses.slug` (text, UNIQUE, nullable) for the URL and `businesses.logo_path` (text, nullable) for the avatar. Neither was used until tonight. The ACTUAL_SCHEMA banking note for Phase E.1.0 explicitly named the missing surface: *"Badge renders on the not-yet-built public storefront."* Step 1 (this migration) makes that storefront's data foundation real; Step 2 (separate commit) ships the user-facing surface.

### Decision

Ship the public storefront as **`/sellers/[slug]`**, with these foundation pieces banked in this migration:

**Schema:**
- `businesses.slug` **backfilled deterministically** from `business_name` via `regexp_replace + lower` SQL and **flipped to NOT NULL** in the same transaction. Going forward, every business — existing and future — has a non-null slug.
- `businesses.logo_path` **NOT modified** (already existed from Phase E.1.0 — this migration just enables the storage layer that will populate it).

**Storage:**
- New `business-avatars` Supabase Storage bucket: **public=true**, 2 MB file size cap, MIME allowlist `[jpeg/png/webp]` (excludes GIF — static branding only — and PDF). Folder structure: `{business_id}/<filename>`.
- Three RLS policies on `storage.objects` mirroring the `product-images` shape exactly:
  - `business_avatars_owner_insert` — INSERT requires `(storage.foldername(name))[1]` (first path segment) match a row in `businesses` whose `owner_id = auth.uid()`.
  - `business_avatars_owner_delete` — same ownership check on DELETE.
  - `business_avatars_public_select` — anyone can SELECT (since avatars are public branding).

### Rationale

**Why backfill + NOT NULL flip in the same transaction:**

Atomicity. The window between "some rows still null" and "constraint enforced" must not be observable to concurrent writers. Doing both in one `BEGIN..COMMIT` means either both land or neither does — no intermediate state where the app starts assuming slug is non-null but a row still has slug=NULL. At apply time the backfill ran over 4 rows (after the operator's pre-migration test-data cleanup of 5 obsolete test businesses); whole transaction was well under a second.

**Why no random suffix on the business slug (unlike listing slugs):**

`generateListingSlug` appends a 4-char random suffix because product titles ("iPhone 15 Pro Max") collide constantly across thousands of listings — the suffix is the only way to guarantee uniqueness without forcing sellers to invent unique titles. Business slugs are different: they're **brand identifiers** that should be stable, human-readable, and brandable. Jiji uses `/dealer/abc-motors`, not `/dealer/abc-motors-xy7z`. Collision is rare (the 4 current business_names produced 4 distinct slugs cleanly); app-layer uniqueness check + numeric suffix (`-2`, `-3`) handles future collisions without polluting normal cases with random gibberish. Step 2 ships `generateBusinessSlug()` mirroring the migration's deterministic shape so app-time inserts produce slugs identical to the backfill.

**Why public-read on the avatar bucket:**

Avatars are public branding — same trust model as `product-images` (anyone can view, only owner can write). Opposite of `verification-id-documents` / `verification-selfies` which are strict-private PII (NIN slips, ID photos, ID-holding selfies — buyer-side display would be a violation of seller dignity AND a data protection breach under NDPR per D-117 placeholder). A buyer browsing the marketplace must be able to see seller avatars without authentication; making the bucket private would require signed URLs on every render of every shop card / every listing detail page seller block — wasteful and complicates server-side rendering. Public bucket + owner-write policy is the right trust shape.

**Why mirror `product-images` RLS shape exactly (not invent a new pattern):**

`product-images` is the existing, deployed, audit-reviewed precedent for "owner-writable / public-readable" buckets on this codebase. Three policies: owner_insert (folder match on first path segment), owner_delete (same check on DELETE), public_select (anyone reads). Inventing a new pattern (e.g. adding an UPDATE policy for upsert semantics) creates a second mental model future maintainers must reconcile against the existing pattern. The replace-avatar flow uses **timestamped filenames** (`avatar-{Date.now()}.jpg`) + new INSERT + best-effort old-file DELETE, sidestepping any UPDATE-policy need entirely. Same shape as how `product-images` handles photo replacement.

**Why 2 MB file size limit (vs `product-images`'s 5 MB):**

Avatars display at 80px max (shop-page header) and 32–48px in listing cards. A 1080×1080 PNG with reasonable compression weighs under 1 MB; even a high-quality square JPG well under 2 MB. The existing `product-images` bucket caps at 5 MB because product photos are display-large (up to 800px wide in detail galleries). Avatars don't need that headroom. Smaller cap = less Storage waste from accidental "I uploaded a 4K screenshot as my logo" mistakes.

### Operational consequences

- **Step 2 app code** carries: `generateBusinessSlug(name: string): string` helper in `src/lib/listings/format.ts` (or a new `src/lib/business/format.ts` — Step 2 directive decides); `getBusinessAvatarPublicUrl(path: string): string` in `src/lib/storage.ts` paralleling `getProductImagePublicUrl`; `/sellers/[slug]/page.tsx` server-component page rendering the business + active listings (Edge runtime, single Supabase query with embedded products); `BusinessAvatarUploader.tsx` client component mirroring `ImageUploader.tsx` shape (browser-direct upload via authenticated session, no signed-URL roundtrip); dashboard avatar widget on `/dashboard/page.tsx` inline with the seller's account info; `updateBusinessAvatarAction` + `removeBusinessAvatarAction` server actions; link integration on `src/app/listings/[id]/page.tsx` line ~346 (wrap `business.business_name` in `<Link href={\`/sellers/${business.slug}\`}>`) + a new "View all listings from this seller →" link in the seller card.
- **Marketplace cards remain unchanged** — per the Phase D.6 density decision (no seller name on cards), buyers discover seller shop pages by clicking through to a specific listing first. The shop page is the catalogue surface; the marketplace is the discovery surface.
- **WhatsApp / reveal CTA is NOT on the shop page header** — reveal is per-listing per D-091 / D-129 / D-133 (accounting model is per-listing); a page-level CTA would either need its own accounting or land buyers into an arbitrary first-listing reveal. Buyers engage with a specific item, not a seller in the abstract. Keeps the "shop page is a catalogue, not a contact form" framing.
- **Verification gate carries forward** — only `verification_status = 'verified'` businesses are reachable at `/sellers/[slug]`. Unsubmitted / rejected businesses 404 even if direct-URL probed. The query also defensively filters `is_disabled = false`.
- **Existing `<Avatar>` component reused** — handles both the uploaded-image branch (rendered from `logo_path` via `getBusinessAvatarPublicUrl`) and the initials-placeholder branch (`business_name.slice(0, 2).toUpperCase()`). Buyer can't tell from a glance whether the seller uploaded an avatar; this is intentional (no "missing-avatar shame" UX).
- **No image processing pipeline** — no resize, no format conversion, no aspect-ratio enforcement at upload time. Display in a `rounded-full` + `object-cover` container; browser handles the visual crop. Adding sharp/jimp processing is deferred until real demand surfaces (a seller complains about non-square avatars rendering poorly, etc.). At 2 MB cap, the upload payload is fine as-is.
- **`businesses.description` (already in schema, nullable, currently unused on any display surface)** — Step 2 renders it conditionally on the shop page below the header when populated. Sellers edit it via the existing `ManageBusinessForm.tsx` on `/sell`. Zero new schema, zero new edit UI; the data is already there.

### Anti-pattern

- **Adding `slug` as a brand-new column when it already exists from Phase E.1.0.** The investigation surfaced this; the directive was adjusted to be a backfill + NOT NULL flip, not an ALTER ADD COLUMN. Discovering forgotten existing-column work is exactly what the "read the schema before writing migration SQL" discipline is for.
- **Adding `avatar_path` as a brand-new column when `logo_path` already exists from Phase E.1.0.** Same lesson. The directive treated `logo_path` as the avatar column rather than introducing a parallel name, which would have been documentation churn for no gain.
- **Making the avatar bucket private.** Forces signed-URL roundtrips on every render — kills server-side rendering performance and creates a buyer-visible auth requirement for what is purely public branding content. The `verification-id-documents` bucket is private for a reason (PII); avatars are not.
- **Appending a random suffix to business slugs.** Listing slugs need this for title-collision reasons; business slugs become brand URLs and must be stable. A seller posting their `/sellers/abc-motors-xy7z` URL to social media gets a worse outcome than `/sellers/abc-motors`.
- **Page-level WhatsApp CTA on the shop page.** Breaks the per-listing reveal accounting (D-091 / D-129 / D-133) and lands buyers into arbitrary first-listing reveals. The shop page is a catalogue; engagement happens per-item.
- **Adding review / rating / response-time / follow-seller features in this build.** Each is a separate scope with its own schema, abuse vectors, moderation surface, and notification infrastructure. The foundation shipping tonight intentionally stops short of any of these — they can layer later if real demand surfaces.
- **Building a separate "branding" admin tool to upload avatars on behalf of sellers.** Avatar upload is a self-service seller action; if the seller doesn't upload one, the initials-placeholder shape works fine. Building admin-upload infra is scope creep.
- **Forcing square aspect ratio at upload time.** Adds client-side validation friction; the circular crop at render handles non-square uploads gracefully. Soft guidance ("Square images look best — 400×400 or larger") is sufficient.

