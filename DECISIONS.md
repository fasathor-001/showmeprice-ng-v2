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

## D-023: Email confirmation OFF at launch

**Context:** Supabase's email auth has a toggle: "Confirm email" (require email-click before sign-in works) on/off.

**Decision:** OFF at v2 launch. Users sign up and are immediately signed in.

**Why:**
- Onboarding friction kills marketplaces. Every step before "able to browse and contact a seller" is a drop-off point.
- The trust gate that matters is **seller verification** (Phase D — ID, business, bank account, admin review). Buyers being verified-via-email adds friction without commensurate trust benefit.
- Abuse via fake email signups is low-cost to clean up (admin can delete profiles + cascading data) and we can flip the toggle if abuse becomes real.

**Operational consequence:** spam signups are possible. K-003 tracks this — if we see real abuse, we flip the toggle, accept the friction, and ship.

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
