# MEMORY.md

Project-specific lessons learned. Append as the project evolves. Each entry is short, specific, and actionable.

## v1 lessons carried into v2

- **The migrations folder is not the database.** Production schema can drift from the migrations directory. Always verify column existence with an `information_schema.columns` query.
- **localStorage role hints are an attractive nuisance.** v1's `smp:role_hint` caused weeks of bugs because the writer logic could choose a stale value. v2 avoids this entirely: role comes from the server on every request.
- **Half-applied migrations are worse than missing migrations.** v1 had `owner_id → user_id` half-applied. Each migration must run to completion or not at all.
- **Phantom column references compile fine in JavaScript.** v1's `profiles.seller_verification_status` was referenced but never existed in the schema. TypeScript with Drizzle-generated types prevents this — regenerate after every migration.
- **Multi-source-of-truth role bugs.** v1's "Amanda as Buyer in header, Seller everywhere else" came from Navbar and Dashboard reading different state. Centralise role reads in one hook.
- **WhatsApp link format must match stored format.** Store without `+`.
- **Cloudflare Pages SPA fallback breaks asset paths.** v1 hit MIME errors on deep links. Next.js with absolute paths from root avoids this — test deep-link navigation, not just home-page.

## Earlier-attempt lessons (Workers + OpenNext + Next.js 16)

- **Ecosystem moves faster than specs.** `create-next-app` defaults move; package recommendations change; deprecations roll out. Always web-search current docs at the start of any greenfield phase.
- **Platform changes cascade across version pins.** When deploying platform changes (e.g. Pages → Workers, or vice versa), re-verify every assumption: runtime version, build tooling, deployment commands, caching primitives. Not just the parts you consciously changed.
- **Cloudflare Workers' wrangler tool requires Node 22+.** Cloudflare Pages' build runtime is Node 20. Choose your deploy target before pinning Node.
- **Windows + symlink-using build tools need Developer Mode.** OpenNext relies on symlinks during bundling; Windows refuses by default. WSL is the long-term answer; Developer Mode is the immediate fix.
- **pnpm's symlinked node_modules confuses static-analysis bundlers.** OpenNext, ncc, and similar tools that statically analyze `node_modules` emit dynamic `require()` calls when they hit pnpm's `.pnpm/` symlinks. Fix: `.npmrc` with `shamefully-hoist=true` and `node-linker=hoisted`. Watch for this with any new bundling tool.
- **"Deprecated" doesn't mean "broken."** A deprecated package is one whose maintainers won't add new features. It still works for current use cases. Don't switch platforms purely to avoid a deprecation warning — weigh the cost of the switch against the realistic timeline of the deprecation.

### Supabase pooler + Drizzle gotchas

Three things that bite if you forget them:
1. **Use port 6543 (transaction pooler) for runtime, 5432 (session pooler) for migrations.** Mixing them up gives confusing errors (connection-limit / pooler-mode mismatch at runtime, or migrations against a pooler that doesn't support DDL).
2. **`prepare: false` is mandatory** when using `postgres-js` against Supabase's transaction-mode pooler. Without it, you get "prepared statement already exists" errors intermittently.
3. **Singleton the Drizzle client in dev.** Next.js HMR creates new module instances on each reload; without a singleton you exhaust the connection pool over a long dev session.

Reference: https://orm.drizzle.team/docs/connect-supabase

### Supabase Direct Connection is IPv6-only — use Session Pooler from IPv4 networks

Supabase's "Direct Connection" (port 5432, hostname `db.<ref>.supabase.co`) defaults to IPv6-only. From any IPv4-only network (most home internet, including typical Nigerian residential ISPs), it fails with `getaddrinfo ENOTFOUND db.<ref>.supabase.co`.

Three options when this bites:
1. **Recommended:** use Session Pooler (port 5432 via `aws-0-eu-west-2.pooler.supabase.com`) for migrations and scripts. IPv4-compatible. Supports DDL, advisory locks, prepared statements. Equivalent functionality to Direct Connection for our use case.
2. Enable Supabase's IPv4 add-on (paid, ~$4/month). Only needed if you specifically need the Direct Connection's behavior over the pooler.
3. Move dev to a network that has IPv6 connectivity (mobile hotspot on some carriers; cloud dev environments). Not practical for daily work.

When the Drizzle docs say "use Direct Connection for migrations," they assume IPv6 connectivity. The functionally-correct rephrasing for IPv4 networks is "use Session Pooler for migrations, Transaction Pooler for runtime."

### Tree-shaking makes the build gate optimistic about not-yet-wired Edge incompatibilities

Phase A specced a Drizzle (`postgres-js`-based) client and added it to `src/lib/db.ts`. Section 5's build gate passed cleanly because no route imported it yet — webpack tree-shook the file out of the bundle entirely. The moment Section 6 imported it from a `runtime = "edge"` page, build failed: `postgres-js` needs Node's `net` module, which isn't in the V8 isolate runtime.

Lesson: when adding a library that will eventually be used in an edge context, also add a *trivial reference to it from an edge route* (a no-op import in a temporary file, removed before commit) and run the build. The build gate then sees what the live bundle will see. Otherwise the build gate is silently passing on infrastructure that won't survive its first real use.

Applies broadly: `pg`, `mysql2`, `oracledb`, anything using `net`/`tls`/`fs` — none of those run on Cloudflare Workers / Pages Functions. Always assume "this works on Node" doesn't imply "this works on edge."

### `next dev` reads `.env.local`, not `.dev.vars`

Cloudflare's `.dev.vars` is the convention for `wrangler` / `wrangler pages dev`. Vanilla `next dev` doesn't know about it — it reads `.env.local` / `.env.development.local` / `.env`. To keep `.dev.vars` as the single local source of truth, the `dev` script wraps Next with `dotenv-cli`:

```
"dev": "dotenv -e .dev.vars -- next dev"
```

Without this, `next dev` boots but env-dependent code (Supabase clients, middleware) throws "your project's URL and Key are required" at request time. `next build` doesn't show the bug because env reads happen at runtime, not bundle time.

### Peer ranges can be unsatisfiable — verify against the registry, not the package.json declaration

`@cloudflare/next-on-pages@1.13.16` declared `next >=14.3.0 <=15.5.2` as a peer range. The planner wrote a spec assuming this meant "bump Next to 14.3." The agent caught the trap: **Next 14.2.35 is the highest 14.x ever published.** After 14.2.35, Next jumped to 15.0.0 — no 14.3 ever shipped (a `14.3.0-canary.77` existed but was never promoted; canary users were told to downgrade).

Lesson: when a peer range looks weird, check `npm view <package> versions --json` against the registry to confirm the named range actually contains published versions. A package can declare an unsatisfiable peer range — usually a typo upstream. Diagnose the upstream bug; don't contort our project to fit it.

The agent's exact verification command:
```bash
npm view next versions --json | jq '[.[] | select(startswith("14."))]'
```

## Working pattern lessons

### Verify schema state before writing specs that reference identifiers

Three "phantom identifier" bugs surfaced in Phase C (column names, FK constraints, table existence assumptions). The pattern: planner specs reference table/column/enum names assumed from memory or journal records rather than verified against the actual database state.

**Rule:** any spec that names a database identifier (table, column, enum, RLS policy, FK constraint, function) must verify the name against `ACTUAL_SCHEMA.md` BEFORE writing the spec body. If the schema doc is out of date, run an `information_schema` query and update the doc first.

**Operational:** at the start of every phase that touches the database, the planner runs (or asks the owner to run) verification queries against:
1. `information_schema.columns` for any table referenced
2. `pg_type` for any enum value referenced
3. `pg_policy` for any RLS policy referenced
4. `pg_constraint` for any FK constraint name used in Supabase nested-resource syntax
5. `pg_proc` for any function call (including its argument signature)

The 30 minutes spent verifying is cheaper than the hours spent debugging "could not find column X" errors after deploy.

### Local `pnpm build` is optimistic about routes Next.js auto-generates

Cloudflare Pages' adapter enforces "all non-static routes must export edge runtime." Next.js's local `pnpm build` does NOT enforce this. The auto-generated `/_not-found` (and the would-be auto-generated `/error`, `/global-error` if we triggered them) won't have the edge runtime export and will silently pass local build, then fail Cloudflare deploy.

Fix: explicitly author `not-found.tsx`, `error.tsx`, and `global-error.tsx` with `export const runtime = "edge"`. Don't rely on Next.js defaults.

Watch-pattern: any time a new top-level route group is added (e.g. Phase B's `/sign-up`, `/sign-in`, etc.), confirm `pnpm build`'s output explicitly lists the system routes, not implicit defaults.

### Phased delivery beats one-big-phase for risky work

Phase C was originally scoped as one giant phase including listing CRUD + image upload + search + filters + verified gating. Mid-planning we recognized this was ~12-15 hours of work compressed into one spec, with high risk of mid-phase architectural surprises (specifically around Supabase Storage and Postgres tsvector search).

We split into Phase C (marketplace core, paste-URL images) and Phase C.5 (uploads + search + filters + verified gating refinement). Same total scope, but a natural recovery point in the middle.

Pattern: when a phase exceeds roughly 5-6 sections, split it. Build something that ships, prove it works, then layer on. Don't conflate ambition with bundling.

### Supabase nested-resource syntax requires the EXACT FK constraint name (not the convention name)

Phase C.4 spec used `profiles!businesses_owner_id_fkey` in a Supabase select for an embedded resource. PostgREST resolves this against the actual database constraint name, which in our Drizzle-generated schema is `businesses_owner_id_profiles_id_fk` (Drizzle's `<table>_<column>_<reftable>_<refcolumn>_fk` convention), NOT the Postgres default `<table>_<column>_fkey`.

The wrong name compiles cleanly (TypeScript can't validate constraint names) and fails at RUNTIME the first time the route is hit, with an error like "Could not find a relationship between 'businesses' and 'profiles' using the hint 'businesses_owner_id_fkey'."

**Lesson:** any spec that uses Supabase's `tablename!constraint_name (...)` syntax must reference the actual constraint name from the database. Verify by running `SELECT conname FROM pg_constraint WHERE conrelid = 'tablename'::regclass` in SQL Editor, or by inspecting the Drizzle-generated migration SQL.

**Where Drizzle uses non-default names:** all FKs in Phase A's schema. The migration file `supabase/migrations/0000_common_donald_blake.sql` is the canonical source.

### Never mutate fetched arrays — spread-then-sort, not sort-in-place

Phase C.5 spec used `images.sort((a, b) => a.sort_order - b.sort_order)[0]` inline on Supabase-returned arrays. `Array.prototype.sort` mutates in place; Supabase JS responses can be frozen depending on caching layer behavior (next/cache, React deduplication), and frozen arrays throw `TypeError: Cannot assign to read only property` when sorted in place.

**Lesson:** always spread fetched arrays before mutating: `[...images].sort(...)` or use non-mutating equivalents (`toSorted` on Node 20+ but not universally available). Applies to `.sort`, `.reverse`, `.splice`, anything that modifies the array.

**Where this matters:** any time you write `someFetchedArray.sort(...)`, `someFetchedArray.reverse(...)`, etc. Even if the current Supabase version returns plain arrays, this is a fragility we don't need to carry.

### Research the market before architecting compliance-adjacent features

Phase C shipped with `verification_status` stored but unenforced — a result of planning the marketplace mechanics without first researching how Nigerian C2C platforms actually handle seller verification. The pivot to Phase C.5 (hard verification gate) came from owner-prompted research into Jumia, Konga, and Jiji's onboarding flows.

**Lesson:** for any feature that touches identity, payments, data privacy, or regulated activity, the planning conversation must include a research pass on how competitors and incumbents in the same jurisdiction handle it. General architectural intuition is not enough — local legal and market norms drive the right structure.

**Operational:** for ShowMePrice specifically, future phases touching Paystack (G), escrow (H), or any compliance surface should start with a "how do competitors handle this" search step before the spec is written.

### Recovery-token sessions are real sessions — don't conflate "logged in" with "knows their password"

Supabase's password reset flow works by issuing a one-time recovery code that, when exchanged via `exchangeCodeForSession` or `verifyOtp`, creates an authenticated session. From the application's perspective, the user is signed in — `getUser()` returns their record, RLS treats them as authenticated, they can call mutations.

This is a feature, not a bug: it lets the password-reset UI call `supabase.auth.updateUser({ password })` directly without re-authenticating.

The trap: if the recovery callback simply redirects to `/dashboard` and shows the dashboard, the user appears "logged in" but never set a new password. If they forgot their old password, they're now in a session that will expire (typically 1 hour) and then they can't get back in.

**Pattern:** any recovery flow that uses a session-creating token must lead the user to a state-setting page (set new password, set new email, etc.) before they leave the flow. Treat the recovery session as a single-purpose context.

Phase B made this mistake. Phase B.7 fixed it. If we ever add other recovery flows (email change, MFA reset, etc.), the same pattern applies.

### Supabase email templates and the callback handler are a tight contract — verify the URL shape

The default Supabase email templates use `{{ .ConfirmationURL }}` which generates implicit/hash-flow URLs (`https://<site>/#access_token=...`). Our callback handler at `/auth/callback` expects code-flow query parameters (`?code=...` or `?token_hash=...`).

The default template silently bypasses our handler entirely. Users click reset links and land at the site root with a hash fragment that nothing reads. They're either dropped onto the home page (appearing logged out) or, if Supabase's client-side JS happens to be loaded, signed in invisibly without a path to set a new password. Both are broken.

**Fix:** customize the email template to use `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=<type>&next=<path>`. The callback handler must support `token_hash` via `verifyOtp` (used by email-link flows) in addition to `code` via `exchangeCodeForSession` (used by OAuth and PKCE).

**Operational:** whenever a phase introduces or modifies a Supabase email template, verify the URL shape matches what `/auth/callback` parses. Add this as a pre-flight check in AGENT.md for any auth-related phase that touches templates.

### Windows .next/trace EPERM lock — third occurrence, banking the pattern

Three times now (Phase A.5, Phase B amendments, Phase B.7.4) Windows dev iteration has hit `EPERM: operation not permitted` on `.next/trace` during `pnpm build`. Cause: leftover Node processes from prior `pnpm dev` sessions still holding the file lock after Ctrl+C didn't reap them.

**Recipe:**
```powershell
Get-Process node | Stop-Process -Force
Remove-Item -Recurse -Force .next
pnpm build
```

If `pnpm dev` is currently running in another terminal, kill that terminal too. Ctrl+C in PowerShell does not reliably stop child node processes.

Pattern is now reliable enough that we don't need to debug it case-by-case — when build hits EPERM on `.next`, run the recipe above and rebuild.

### `replace_all: true` is dangerous on short generic code patterns

When editing files via Edit-with-replace-all, common code patterns (like `redirect("/dashboard");`, `return null;`, or any short non-distinctive line) appear in many places. Replace-all will silently fire on every match.

Phase B.7.5 hit this when editing `updatePasswordAction`: the target block `revalidatePath("/", "layout"); redirect("/dashboard");` appeared in three actions (signUp, signIn, updatePassword). Using `replace_all` accidentally re-routed signUp and signIn to `/dashboard?toast=password-updated` too. Caught on re-read, reverted with surgical edits.

**Rule:** before using `replace_all: true`, verify the target string is genuinely unique to the intended call site. For common-pattern lines, use:
- Unique surrounding context as part of the `old_str` (e.g. the function name above it + the line itself)
- Or separate `Edit` calls with single-call replacements

Generic strings (any short common code) → always use unique context, never replace_all.

### Auth metadata flow: signup data must match trigger's read path

When using Supabase's `handle_new_user` trigger to auto-create profile rows, the trigger reads from `raw_user_meta_data->>'key'`. The signup call MUST pass these values via `signUp({ options: { data: { key1, key2 } } })` for the trigger to populate them.

Easy to miss: a signup without `options.data` succeeds, the user gets created, the profile gets created with empty/default values, and we have no good recovery UX. Always verify the trigger's expected keys match the signup form's submitted keys.

The Phase A trigger reads `display_name` and `whatsapp_number`. The Phase B signup action passes exactly those keys. If a later phase adds a profile field that should be set at signup, both the trigger AND the signup payload need updating.

### Design tokens, not magic values

Before any UI work: encode every color, spacing value, radius, shadow, and font size as Tailwind config tokens. Components compose tokens via utility classes. Never paste hex codes into JSX. Never use magic margins. The cost is 30 minutes upfront. The savings: every design tweak from then on touches one config file, not the entire codebase.

This is the same principle as D-016's "schema is the database, not the migrations folder." Single source of truth wins.

### Pre-flight owner actions must be paired with verification queries and explicit owner paste-back

Phase C.5 had five pre-flight items (P.1–P.5). All five were "specced as owner actions" but only became fully applied after explicit verification queries returned the expected state and were pasted back during execution. The pattern of "spec says owner runs SQL X" without an inline verification query led to repeated drift between assumed and actual database state.

**Operational:** every owner SQL pre-flight should include an inline verification query immediately after, with the spec requiring the owner to paste the output as proof of application. Trust no spec text alone as proof of database state. Phase C.5's P.2 (RLS tightening) was applied without verification during the unified spec; we discovered Section 4 was building against the assumed-applied state, not actually-applied. Same pattern recurred for P.3, P.4, P.5.

### Cloudflare Pages edge runtime is incompatible with `revalidatePath` / `revalidateTag`

Next.js's revalidation mechanism fails on Cloudflare Pages with errors like `Illegal invocation: function called with incorrect this reference` or `Cannot read properties of null (reading 'default')`. When the action `redirect()`s after the failed revalidation, the failure is invisible — but actions that return success state (instead of redirecting) get visible 500 errors.

**Operational:** drive UI freshness via navigation (`redirect()` to refresh page), not via cache invalidation (`revalidatePath`). Never call `revalidatePath` in any server action on this codebase, regardless of whether it's followed by a redirect.

### URL-driven UI state must be captured to component state on first read

Reading derived state directly from `searchParams` on every render creates an unmount cycle when the URL is programmatically replaced (e.g., to strip `?toast=` after consuming). Solution: capture the resolved value into local `useState` on first render, then let subsequent renders ignore the cleaned URL.

Caught in C.5.6.0.1 — toast was disappearing in ~1 frame because `router.replace()` stripped the param, the re-render saw `null`, and the toast unmounted before its dismiss timer fired.

### FK constraint naming is inconsistent between Drizzle migrations and raw SQL ALTER TABLE

Drizzle's convention: `<table>_<col>_<reftable>_<refcol>_fk`. PostgreSQL's auto-naming for FKs added via raw `ALTER TABLE`: `<table>_<col>_fkey`. The same table can have FKs with different conventions if some were added via Drizzle and others via raw ALTER. (Phase C.5's `seller_verifications.address_state_id_fkey` is `_fkey` because P.1 used raw SQL; `business_id_businesses_id_fk` is `_fk` because Drizzle generated it.)

**Operational:** never reference FK constraint names explicitly in Supabase JS embeds. Use implicit resolution: `nigerian_states(name)` not `nigerian_states!<constraint>(name)`. Implicit form resolves regardless of source-of-generation.

**Refines:** K-008 (originally about Drizzle's `_fk` vs `_id_fk` confusion; now expanded to include `_fkey` vs `_fk` cross-source case).

### Build gates catch syntax errors; only end-to-end smoke tests catch runtime/integration issues

`pnpm typecheck && pnpm lint && pnpm build` passing does not mean code works. Phase C.5 had a follow-up commit on roughly every section (2.1, 3.1, 5.1, 5.6.0, 5.6.0.1, 6.1, 8.1) — each catching something only visible at runtime: redirect to wrong destination, `/sell` crash for buyers, toast unmount, edge runtime `revalidatePath`, FK name mismatch, banner copy inconsistency. None of these would have surfaced before deploy + browser test.

**Operational:** plan for at least one follow-up commit per section that involves runtime behavior, file I/O, redirects, or external service interaction. Make hard-stop smoke tests the actual gate, not the build gate.

### Database freeze triggers shape application architecture, not the other way around

Phase C.5's submit flow was redesigned because Phase A's `businesses_freeze_verification` trigger blocks non-admin writes to `verification_status`. Initial approaches (service role wrapper, custom trigger relaxation) worked against the security model. Final approach (seller writes to audit table, admin actions consume it) works with it.

**Operational:** when a database constraint, trigger, or RLS policy "gets in the way," the application flow should change to respect it. The constraint usually encodes a security or correctness guarantee that workarounds dilute. Pattern: for any sensitive state field protected by a freeze trigger, route state changes through admin-only actions, let user-facing actions write to an audit/submission table that admins consume.

### Auth trigger metadata is the bridge between client signup and profile state

Phase A's `handle_new_user` trigger reads from `auth.users.raw_user_meta_data` to populate profiles. Application code sets metadata via `supabase.auth.signUp({ options: { data: {...} } })` and that flows into the trigger. NOT every metadata field is automatically read — the trigger must explicitly select fields. (Phase C.5's signup passes `user_type` in metadata as forward-compat, but the current trigger doesn't consume it; application does post-signup UPDATE instead.)

**Operational:** when adding user-shape fields that need to be set at signup, decide: read in trigger (atomic with profile creation, but requires trigger update) OR read in application post-signup (no trigger dependency, but requires explicit UPDATE permission via RLS). The application path requires the relevant RLS policy to allow self-updates AND the freeze trigger NOT to block the column. Phase C.5 `user_type` passes both checks; `role` doesn't (frozen by trigger) so role updates must go through admin override.

### For critical user actions, prefer dedicated confirmation pages over transient toasts

Critical actions (signup, verification submission, admin approval, escrow funding, dispute filing) merit dedicated confirmation pages, not toasts. Confirmation pages give clear acknowledgment, room to explain next steps, and exit points to other parts of the app. Routine actions (save description, mark read, update preference) can use toasts (4–7 seconds, prominent). Always-on indicators (autosave, search filters) can use inline indicators.

Caught in C.5.2.1 (signup confirmation) and C.5.5.1 (verification submission confirmation).

### Three-layer defense-in-depth for sensitive state

Phase C.5's listing-visibility gate is enforced at three independent layers:

1. **App-layer:** page renders gate page instead of form when `verification_status !== 'verified'`
2. **Action-layer:** server action returns error response if state check fails (catches direct POST attempts)
3. **DB-layer:** RLS policy filters rows from public marketplace queries

Each layer catches different failure modes. App layer catches normal users. Action layer catches devs replaying captured form submissions. DB layer catches anyone who somehow bypasses both above. The cost is small (one if-block per layer); the security guarantee is real.

**Pattern for future phases:** for any feature with sensitive access control (escrow status, message content filtering, premium tier features), apply all three layers.

### State derivation logic should live in a single helper, not be duplicated across pages

The verification state machine has five states derived from two database signals (`businesses.verification_status` and latest `seller_verifications.status`). Originally each page consuming this state had its own switch ladder. Section 8 extracted `getVerificationState({ business, latestSubmission })` to `src/lib/verification.ts`.

**Operational:** when the same multi-signal state derivation appears in 2+ pages, extract it. The cost is one helper file; the benefit is a single source of truth for state mapping. Phase C.5 caught a latent bug in `/sell` during the extraction (was reading only one signal, was mislabeling pending sellers as "Verification needed").

### `revalidatePath` ban on Cloudflare edge runtime — keep re-banking it

Phase C.5.6.0 documented that `revalidatePath` is broken on Cloudflare Pages edge (silent failures + visible 500s). Phase D had to refresh-bank this lesson multiple times because the pattern tried to creep back in via copy-paste from older code. **The rule:** never call `revalidatePath` in any server action. Rely on `redirect()` for navigation-driven freshness; the destination page re-fetches naturally.

Lookout for it during code review: any `import { revalidatePath } from "next/cache"` is a smell. The import line should not exist in any new server-action file.

### `ON CONFLICT (slug) DO NOTHING` for idempotent migration INSERTs

Multiple Phase D sections (D.4.1 most visibly) hit `duplicate key violates unique constraint "categories_slug_unique"` errors when the owner retried a SQL block. The errors weren't from the migration failing — first attempts succeeded; subsequent attempts hit the already-inserted rows.

**Operational:** SQL migration blocks that INSERT into tables with unique constraints should always use `INSERT ... ON CONFLICT (slug) DO NOTHING` (or the relevant unique-column conflict target). Makes the block safely re-runnable; failed-and-retried runs produce no noise.

### Slug-keyed lookups, not icon_name-keyed

Phase D.4.1 caught that `getCategoryEmoji()` was keyed on `categories.icon_name` — but the column had stale or NULL values on rows added via raw `ALTER TABLE` / `INSERT` instead of through the Drizzle seed (where the icon_name was originally specified). The fallback emoji `🏷️` was rendering for new Tier-2/Tier-3 categories.

**Fix:** refactored the lookup to key on slug (canonical, always present, the actual identifier the rest of the app uses). `icon_name` stayed in the schema as vestigial — kept the column NOT NULL where it was, populated NULL on new rows, no readers consult it. Could be dropped in a future cleanup migration but no urgency.

**Lesson:** when a column's value depends on the path that created the row (Drizzle seed vs raw SQL), don't read it for runtime UI. Read the columns that the unique constraint enforces (slug is always set; it's the URL identifier).

### Header-vs-page UI duplication audit when adding global affordances

Phase D.5 added a global header search. Phase D.5.1 caught that the home page Hero and `/marketplace` page each had their own search inputs from earlier phases. Three search bars on two pages — confusing.

**Operational:** adding global UI requires auditing every page for redundant local versions. Don't trust that "old code will get cleaned up later" — explicit removal as part of the same commit as the addition.

**Banked example:** when adding the global header search, the same commit (or an immediate follow-up) should drop the Hero search input and any page-level keyword inputs. Page-level filters that aren't keyword (state filter, category filter) can stay.

### Dynamic feature lists with hardcoded fallback

Phase D.6.2 pattern: query top N entries by some real-data metric (listing count, search frequency, etc.), pad with a hardcoded fallback order if fewer than N entries have data. Prevents "looks broken at launch" while enabling data-driven evolution.

**Implementation:** `getFeaturedCityChips()` in `src/lib/states.ts` returns up to 9 city chips. Top entries by `count(products WHERE verified)`; padded with `FEATURED_STATE_SLUGS` order when listings are sparse.

**Pattern applies to:** featured listings (could pad with most-recent if Featured isn't curated yet), trending categories (pad with Tier 1 order if no clicks-data exists), etc.

### JSONB for evolving schemas

Phase D used JSONB columns in two places: `products.category_specs` (D.7 — per-category dynamic fields) and `categories.search_aliases` (D.7.2 — array of alias strings). Both share a trade-off: DB doesn't enforce shape, application is authoritative.

**When the trade is right:** rapid iteration on shape (added fields, removed fields, reordered fields). No migrations on every change. Postgres JSONB supports indexing if specific paths need fast filtering later.

**When the trade is wrong:** when the data is queried by exact path frequently or when DB-level constraints matter for correctness. Promote frequently-queried JSONB fields to columns when patterns stabilise.

### Agent-vs-DB state divergence — verify before assuming

Phase D Section 7 caught that the agent's mental model of `Vehicles` subcategories was empty (because earlier seed work hadn't tracked any), but the live DB had three children (cars, motorcycles, vehicle-parts). They'd been added via a SQL action that the seed file wasn't updated for.

**Operational:** the agent reads slugs / relationships from migrations and seed files; the live DB may differ. Before designing a feature that depends on "this table has rows X, Y, Z" — verify with a DB query. Especially when the data is curated (categories, states) and may have been touched outside the seed.

**Workflow hook:** when a section spec assumes a particular schema or data shape, include a verification query at the top of the section's pre-flight that the owner runs and pastes back. Done routinely throughout Phase D.

### PostgREST joined-table filter inside `.or()` is unreliable

Phase D.7.1 added `categories.name.ilike.%q%` as a third clause inside the products `.or()` filter (alongside title.ilike and description.ilike). The clause silently failed to evaluate — searching "cars" missed Cars-subcategory listings even though the SQL query string looked correct.

**Fix (D.7.2):** two-step server-side resolution. Step 1: query `categories` separately for slugs/aliases matching the query, collect IDs. Step 2: products query uses `category_id.in.(uuid1,uuid2,...)` inside `.or()` — a clean IN clause that PostgREST handles reliably.

**Lesson:** PostgREST `.or()` with joined-table filters is grammatically valid but practically fragile. The safe pattern is to resolve the joined-table matches into a list of IDs in a separate query, then filter on the foreign key with `.in.()`. Worst case adds one round trip; predictable and debuggable.

### Search alias-purity: aliases are category synonyms, not brand identifiers

D-049 is the architectural rule; D-050 is the refinement. Banking the working pattern here for fast reference:

**Aliases in `search_aliases`:** terms that mean "give me everything in this category." Examples: rice, spice, wine, beer, perfume, fragrance, vehicle, automobile.

**Never in aliases:** brand names, model names, product line names. Examples: Toyota, Honda, iPhone 15, Galaxy, MacBook Pro, ThinkPad, Maggi, Coke. These match via `title.ilike` and `description.ilike` against real listing text.

**Borderline cases (the oud test):** does the term primarily describe the category, or identify the maker?
- "Oud" describes a scent type across many brands → in.
- "Maggi" refers to a specific seasoning brand → out.

When in doubt, exclude. Easier to add aliases later (no migration; just an UPDATE) than to surgically remove ones that polluted the search.

### `cs.["value"]` syntax for JSONB array containment in PostgREST

`search_aliases.cs.["car"]` checks "does the JSONB array contain the literal string 'car'?" Safe to use inside `.or()` because the bracketed single-value payload contains no commas to confuse the top-level `.or()` parser.

**Multi-word values:** `cs.["car perfume"]` works — the space is preserved as part of the JSON string literal. Supabase JS handles URL encoding (space → `%20`) transparently. Verified with "g wagon", "car perfume", "construction materials" aliases.

**Don't use:** `cs.[a, b, c]` — multiple values in a single `cs.` filter would inject commas the `.or()` parser interprets as filter separators. Use multiple separate `.or()` clauses or expand to `cs.["a"],cs.["b"],cs.["c"]`.

### Read-time aggregation as scale watchpoint

Phase D.6.2's `getFeaturedCityChips()` runs 1–3 queries per home render (categories lookup, optional children fan-out, products aggregation). Fine at v2 scale (~30-category taxonomy, low listing volume). Banked as a scale watchpoint — promote to a Postgres function or materialised view if either listing volume or home-page traffic grows enough that the queries' aggregate cost matters.

**Lesson:** read-time aggregation is the right starting point. Premature materialisation is a worse problem than read-time-query overhead at v2 scale. But document the watchpoint at the time you write the helper, so the future-you who hits the scale wall knows where to look.

### Storage path is not a URL — convert at render boundary

Phase D.2's real image uploads stored bucket-relative paths in `product_images.storage_path` (e.g., `{business_id}/{product_id}/0-{timestamp}.png`). Phase D.2.1 caught that six render sites were passing the raw path directly as `<img src>` — the browser treated the path as relative to the current route and 404'd.

**Fix:** `getProductImagePublicUrl(path)` helper in `src/lib/storage.ts` constructs the full public URL from the path + `NEXT_PUBLIC_SUPABASE_URL`. Every `<img>` site that consumes `product_images.storage_path` wraps through the helper.

**Lesson:** if a column holds a *path* (relative identifier) rather than a *URL* (absolute resource locator), the conversion to URL has to happen at the render boundary. Naming the helper after the conversion (`getProductImagePublicUrl`, not `imgUrl`) makes the intent obvious at every call site. Adding a similar storage column in the future? Add a similar helper at the same time.

### Category-restructure count-check before DELETE

Phase D.7.4 split `food-beverages` into two new Tier 2 categories. The migration DELETEd the old category before INSERTing the replacements. Pre-flight count-check confirmed 0 listings under `food-beverages` so the DELETE was safe.

**Operational:** any category restructure (DELETE / replace / merge) requires this query first:

```sql
SELECT count(*) FROM products
WHERE category_id IN (SELECT id FROM categories WHERE slug = '<old-slug>'
                      OR parent_id = (SELECT id FROM categories WHERE slug = '<old-slug>'));
```

If `count > 0`, plan a migration UPDATE to move those listings to a replacement category before the DELETE. Don't assume count is 0 even early in a project's life — manual test listings accumulate.

### Taxonomy research first — Nigerian conventions beat generic e-commerce assumptions

Phase D's most impactful taxonomy decisions came from explicit Nigerian-market research:
- D.7.4 "foodstuff" terminology (Olubrooklyn, AgroHandlers, Bodija/Balogun markets).
- D.7.5 Perfume as standalone Tier 2 (Jiji, Jumia, Fragrances.com.ng, The Scents Store all surface it top-level).
- D.7.6 Building Materials volume (Jiji.ng has 52,165+ active listings).

**Operational:** before designing a category structure, check how Jiji, Jumia, and dedicated Nigerian retailers categorize it. Their data reflects what Nigerian buyers actually look for; generic e-commerce assumptions (Western taxonomy patterns, Amazon's hierarchy) regularly miss the local mark.

### Build gates catch syntax; smoke catches runtime

Every Phase D section (and most Phase C.5 sections before it) had at least one follow-up commit triggered by smoke-test discovery:
- D.2 → D.2.1 (storage path render bug)
- D.3 → D.3.1 (gallery sizing + Hero dropdown)
- D.4 → D.4.1 (tier promotions)
- D.5 → D.5.1 (duplicate search bars)
- D.6 → D.6.1 → D.6.2 (city chip refinements)
- D.7 → D.7.1 → D.7.2 → D.7.3 → D.7.3.1 → D.7.4 → D.7.5 → D.7.6

**Operational:** plan for at least one follow-up per section that involves runtime behaviour, file I/O, redirects, or external service interaction. Don't expect first-commit perfection. The discipline of "build green + smoke + follow-up" holds quality without expecting infallibility.

### Mobile-overlay pattern for breakpoint-conditional UI

When the interaction model differs significantly across breakpoints (e.g., desktop inline form vs mobile icon-button overlay), encapsulate both modes in a single focused client component. The parent (a server component like the Header) just renders the client component; the client component branches on breakpoint via Tailwind responsive classes plus runtime state for the overlay.

**Working example:** `src/components/layout/HeaderSearch.tsx` (Phase D.7.3.1). Desktop renders the inline form. Mobile renders an icon button plus a conditional overlay. Open/close state lives entirely inside the client component; the Header stays server-rendered.

**Pattern applies to:** any future header CTA where mobile needs different chrome (filters, notifications, account switching). Keep the state-owning component small and focused; let breakpoint-driven CSS handle the layout.

### Pre-flight check for function/trigger references before column renames

Phase E.1.0 renamed `profiles.whatsapp_number → profiles.phone`. The application-code rename was easy to find via grep. What grep missed: the `handle_new_user` trigger function lives in Supabase's pg_proc, not in our repo. The trigger INSERTed into `profiles.whatsapp_number`, so every signup threw a column-not-found error from the moment the rename landed until the trigger was hotfixed.

**Operational:** before renaming any column in a migration, run this pg_proc scan against the database and confirm zero rows or all-known-and-handled rows:

```sql
SELECT n.nspname, p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE pg_get_functiondef(p.oid) ILIKE '%<old_column_name>%';
```

Search the function body for the old name. If any rows return, either:
- (a) Update those functions in the same migration transaction (`CREATE OR REPLACE FUNCTION`), or
- (b) Add a compatibility shim (COALESCE on the new and old metadata key, as we did in `handle_new_user`'s metadata read) so the trigger works with either column name during the rename window.

**Why this matters:** Drizzle migrations track schema changes but **don't track function/trigger bodies**. The migration history sees the column rename; the trigger that referenced the old column is invisible to Drizzle's diff. The check has to live in the migration pre-flight, not in the Drizzle schema. Applies to: column renames, table renames, type changes that would break function calls.

**Phase E.1.0 hotfix pattern (banked for re-use):** `CREATE OR REPLACE FUNCTION` is online — no table lock, no downtime. Apply it in the same SQL transaction as the column rename if possible. The Phase E.1.0 break was a few minutes of broken signups (no real users), but on a populated production database that's an outage.

### Phase E photo rule: minimum 1, suggest 3+, maximum 8

Earlier Sprint 3 scoping initially answered "no maximum" on listing photos. That was wrong — the Phase E spec photo rule is **minimum 1, suggest 3+, maximum 8**. Correcting it here so the cap doesn't get re-derived from the stale answer.

**Operational:** when a scoping answer contradicts the written spec, the spec wins and the correction gets banked — don't leave the wrong answer as the most recent word on it.

### DB-first / code-second so code can always roll back to a clean HEAD

When a code commit references database state (a new column, enum value, function, or category row), ship the DB change first and confirm it applied, *then* commit the code. The ordering matters for recovery: if code lands first and the migration is delayed or fails, `git reset` to a clean HEAD still leaves code referencing a column that doesn't exist. DB-first means every code commit on `main` references state that already exists.

**Exception:** code-only changes that don't reference DB state (refactors, dead-code deletion, type-only changes) don't need DB-first sequencing — the rule applies specifically when code references new DB state. (E.g. the Sprint 3 `ListingForm.tsx` deletion needed no DB step.)

**Operational:** the migration runs in Supabase and is verified (paste-back) before the code commit that depends on it. Used throughout Sprint 2 (E.2.0.x) and Sprint 3.

### Two-sided data discipline: audit BOTH code-side and DB-side before any UPDATE/REPLACE

When a migration touches data that has both a code-side representation (`seed.ts`) and a database-side representation (production rows), audit BOTH before any UPDATE/REPLACE. Count-based diffs are triage only — they tell you *whether* something diverged, not *what*. Element-by-element comparison is required for true reconciliation.

**Caught in Sprint 3:** seed-vs-prod category counts looked like "drift up" in some categories until the seed file was read exactly — every apparent drift-up was an undercount in the audit estimate, and real drift was unidirectional (7 drift-down categories). Estimated counts (using approximations) manufactured false signals; exact counts revealed unidirectional drift only.

### Validation pattern split: required-on-listing vs optional-on-business is intentional

The Sprint 3 `city_area` work deliberately uses two validation patterns, and the split should NOT be collapsed into one parameterized helper:
- **Listings** (create/edit) use the exported `validateCityArea()` — required, trim, min 3, max 100.
- **Business** (become-seller/manage) uses inline action-side validation — optional, max 100, empty allowed.

A single `validateCityArea(value, { required })` helper would obscure the real difference: required-vs-optional *and* min-length-vs-empty-OK are different validation shapes, not one shape with a flag. Keeping them separate makes each call site's contract obvious.

**Lesson:** when considering whether to parameterize two validators into one, check what the parameter actually toggles. If it toggles the same rule with different inputs (different max lengths for different fields), parameterize. If it toggles fundamentally different validation shapes (required vs optional, presence vs absence checks), keep them separate. Duplication that documents intent beats abstraction that hides it.

### Public storefront is a Phase F+ dependency — bank deferred foundations as a known gap

Multiple Phase E spec items depend on a public seller storefront route that does not exist in Phase E: sold-as-trust-signal, founding-seller-badge-as-trust-signal, reply-rate metrics, and seller analytics view. The data foundations for several of these are being laid in Phase E (founding-seller fields, mark-as-sold status), but they have no public surface to render on yet.

**Currently waiting on storefront:** Founding Seller badge display (D-088), sold-listing trust signal (Gap B), seller reply-rate display (Phase F+), seller analytics view (Phase F+). When storefront ships, these activate as a coordinated batch.

**Lesson:** when storefront ships in Phase F+, these deferred foundations activate together. Banking this as a known platform gap so future audits don't misclassify "founding-seller field exists but renders nowhere" as a bug — it's deferred-by-design, waiting on the storefront route.

## Naming conventions

- Database columns: `snake_case` (e.g. `user_type`, `verification_status`, `phone`)
- TypeScript variables: `camelCase`
- React components: `PascalCase`
- Route segments: `kebab-case`
- Server Actions: prefixed with verb (`createListing`, `revealContact`)

## Things that look like they should be cached but should not be

- Current user's role / tier
- Verification status
- Anything an admin can change about another user

## Things worth caching

- Listing pages (revalidated on mutation)
- Category lists, state lists (revalidate hourly or on mutation)
- Static marketing pages (build-time)

## Supabase SQL Editor: partial-execution trap

**Behavior:** the Supabase SQL Editor runs **only the highlighted text** when any text is selected, or **the entire editor contents** when nothing is selected. The behavior is invisible — there's no "currently running highlighted region" indicator before you click Run.

**Failure mode:** paste a multi-statement BEGIN/COMMIT block, accidentally leave a selection from the paste action (or from scrolling-with-shift-click), click Run, and only the selected statements execute. The transaction wrapper may be inside or outside the selection in ways that aren't obvious — you might get a partial COMMIT of only the highlighted CREATE POLICY statements, or a syntax error from running a fragment, depending on what was selected.

**Hit once during E.1.4.b** — only one `CREATE POLICY` landed before recovery. Recovery was clean (DROP + re-run the full block) because the policies are idempotent under the BEGIN wrapper.

**Pre-Run check pattern:** before clicking Run on any multi-statement SQL block, verify the editor shows **blinking cursor only with no text selection**. If anything is highlighted, click somewhere neutral in the editor to deselect first. Especially important for BEGIN/COMMIT blocks where partial execution can leave inconsistent state.

**Adjacent gotcha (banked during E.1.1):** the SQL Editor wraps verification queries in an implicit `LIMIT 100` unless "No limit" is toggled. Aggregate functions like `array_agg` fail with `42809: "array_agg" is an aggregate function` because the implicit LIMIT interacts badly with the aggregate. For aggregates in verification queries: either toggle "No limit", or rewrite as row-per-value form that doesn't need the aggregate.

## INSERT with explicit NULL on a NOT NULL DEFAULT column

**Failure mode:** when a column is declared `NOT NULL DEFAULT <value>`, an INSERT statement that lists the column with an explicit `NULL` value will fail the NOT NULL check — the default is only applied when the column is **omitted** from the INSERT, not when it's explicitly NULL.

```sql
-- Column declared:
metadata JSONB NOT NULL DEFAULT '{}'::jsonb

-- Fails:
INSERT INTO tier_features (tier, feature_key, enabled, metadata)
VALUES ('free', 'browse_listings', TRUE, NULL);
-- ERROR: null value in column "metadata" of relation "tier_features"
--        violates not-null constraint

-- Passes (default applies):
INSERT INTO tier_features (tier, feature_key, enabled)
VALUES ('free', 'browse_listings', TRUE);

-- Also passes (literal default):
INSERT INTO tier_features (tier, feature_key, enabled, metadata)
VALUES ('free', 'browse_listings', TRUE, '{}'::jsonb);
```

**Hit during E.1.5 tier_features seed** — agent listed `metadata` in the column list with `NULL` for baseline-feature rows; full transaction rolled back. Fix was NULL → `'{}'::jsonb`.

**Rule of thumb:** for any column with `NOT NULL DEFAULT X`, the INSERT must either omit the column entirely (letting the default apply) or pass the literal default value. Never explicit NULL. When uncertain whether a column has `NOT NULL DEFAULT`, the safe pattern is to omit it from the INSERT and let the database apply the default — explicit values are only needed when overriding the default.

**Pre-flight discipline:** when writing seed/migration INSERTs against a table you didn't just create, check `information_schema.columns` for `is_nullable` and `column_default` on every column being inserted. Five-second check, saves a full transaction rollback.

## Postgres auto-rewrite scope on column rename

**Verified during E.1.4.b pre-check:** Postgres auto-rewrites column *references* in stored expressions on `ALTER TABLE ... RENAME COLUMN`. What gets auto-rewritten vs. needs manual cleanup:

**Auto-rewritten by Postgres (no work needed):**
- RLS policy bodies (`pg_policies.qual`, `pg_policies.with_check`)
- CHECK constraint expressions
- Generated column expressions
- View definitions (regular views and materialized views)
- Function bodies that reference columns by name in static SQL

**NOT auto-rewritten (manual cleanup required):**
- Constraint names — D-080 (e.g. `subscriptions_profile_id_profiles_id_fk` survives the rename of `profile_id → user_id`)
- Index names — D-069 (e.g. `subscriptions_profile_idx` survives)
- Function bodies that build SQL dynamically (`format()` / `||` / `EXECUTE`) — D-055 pg_proc scan still required
- Comments in code / docs that reference column names

**Pre-flight diagnostic trio for column renames** (run before the ALTER):
```sql
-- pg_proc: catches dynamic-SQL function bodies
SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE pg_get_functiondef(p.oid) ILIKE '%<old_column_name>%';

-- pg_indexes: catches index names
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname ILIKE '%<old_column_name>%';

-- pg_constraint: catches FK/CHECK constraint names
SELECT conname, conrelid::regclass FROM pg_constraint WHERE conname ILIKE '%<old_column_name>%';
```

Policy bodies don't need a separate scan — Postgres has us covered there.

## Synthetic-scenario verification: pg_temp function returning a TABLE

**Problem (banked during Sprint 2):** The Supabase SQL Editor splits multi-statement submissions in a way that does NOT preserve TEMP tables — or even regular tables — across statement boundaries inside a single `BEGIN`/`ROLLBACK` transaction. A naive "CREATE TEMP TABLE results; INSERT scenario rows; SELECT * FROM results; ROLLBACK" pattern loses the temp table between statements.

**Workaround that works:** define a `pg_temp` function that returns a `TABLE(...)`, then `SELECT * FROM pg_temp.fn_name()` in the same submission, all wrapped in `BEGIN ... ROLLBACK`:

```sql
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.test_scenarios()
RETURNS TABLE (scenario TEXT, expected TEXT, actual TEXT, pass BOOLEAN)
LANGUAGE plpgsql AS $func$
BEGIN
  -- mutate state, call the function under test, RETURN QUERY SELECT rows
  RETURN QUERY SELECT 'case 1'::TEXT, 'X'::TEXT, actual_val::TEXT, (actual_val = expected);
  -- ... more scenarios ...
END;
$func$;
SELECT * FROM pg_temp.test_scenarios();
ROLLBACK;
```

Each scenario is a `RETURN QUERY SELECT`; the whole thing returns one clean result grid; the `ROLLBACK` discards all synthetic mutations (including any INSERTs the function made and the pg_temp function itself). Used in E.2.0.1 (reveal-cap branches), E.2.0.2 (escrow fee scenarios), E.2.0.4 (CHECK constraint behavioral test). This is the canonical pattern for "verify a function across N scenarios without persisting test data."

## Pre-flight column-coverage discipline for synthetic test INSERTs

**Banked during Sprint 2 (E.2.0.2):** when a migration's verification includes synthetic-scenario INSERTs (the pg_temp pattern above), the pre-flight column-check query must cover EVERY column the INSERT references — not just the columns the function-under-test reads internally.

Half-coverage is a real trap: in E.2.0.2 the pre-flight verified `subscriptions.user_id/status/current_period_end` (the columns `compute_escrow_fee` reads) but the V4 synthetic INSERT also referenced `payment_provider`, `plan_code`, `started_at`. A stale column name in the INSERT would surface as a "column not found" error during V4 that the operator misreads as a function bug — when the real issue is test setup. List every INSERT column in pre-flight.

## Surface design conflicts against banked decisions before drafting code

**Banked during Sprint 2 (E.2.0.2):** when the planner proposes a design that contradicts a banked decision, the agent must surface the conflict and resolve it explicitly before drafting code — never silently absorb the deviation. The discipline runs both directions:

- E.2.0.2: the planner improvised `compute_escrow_fee(p_amount_kobo, p_buyer_tier TEXT)` — but D-086 had banked `(p_amount_kobo, p_user_id UUID)` with a subscriptions-lookup (not tier-param) design. The agent surfaced the divergence with a 3-option table; the planner chose to ship D-086 as banked.
- The TEXT-tier proposal would also have broken the trust boundary (server-side recomputation means the function IS the boundary; accepting a caller-supplied tier puts the caller back inside it).

This is D-079 applied to code design, not just decision-doc framing. A banked decision is the default; deviating from it requires an explicit re-bank, not a silent code change. Cheap to surface, expensive to discover post-ship.

## SECURITY DEFINER lockdown needs explicit anon + authenticated REVOKEs, not just PUBLIC

**Vulnerability class — banked during Stage 2.A (E.2.1.1).** Supabase auto-grants `EXECUTE` on every `public`-schema function to BOTH the `anon` and `authenticated` roles. `REVOKE ALL ... FROM PUBLIC` does **not** remove those role-specific grants — `PUBLIC` is a separate grantee from the named roles. So a `SECURITY DEFINER` function meant for service-role-only access, locked down with only `REVOKE ... FROM PUBLIC`, is **still callable by any signed-in user via `rpc()`** — which for `mark_phone_verified` would have meant any authenticated user could self-grant `'phone_verified'`. Caught at the §2d verification step (the grant audit returned `anon` + `authenticated` rows).

**Mandatory lockdown for any service-role-only SECURITY DEFINER function:**
```sql
REVOKE EXECUTE ON FUNCTION public.fn(...) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn(...) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn(...) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn(...) TO service_role;
```

**Always verify post-deploy** — neither `anon` nor `authenticated` may appear:
```sql
SELECT grantee, privilege_type FROM information_schema.routine_privileges
WHERE routine_schema='public' AND routine_name='fn';
-- PASS: service_role (+ owner) present; anon / authenticated / PUBLIC absent.
```

This applies to EVERY future `SECURITY DEFINER` function on this codebase. Writing one with only `REVOKE FROM PUBLIC` reopens the same self-grant vector — treat the triple-REVOKE + grant-audit as a non-negotiable checklist item, paired with `SET search_path = public`.

---

## Banked Principles

Six non-negotiable architecture rules. These are not lessons learned in flight — they are upfront design commitments that constrain every monetization, product, and platform decision. Any new feature, decision, or change must respect all six. If a proposal violates one, the proposal is wrong, not the principle.

### Principle 1: Escrow is buyer-gated, never seller-gated.

A seller never needs a paid plan for buyers to access escrow protection. Seller must be active, verified, and payout-ready — these are operational requirements, not monetization gates. Free Sellers can and do receive escrow-protected orders. Banked: D-082, D-091.

This principle exists because the alternative — requiring sellers to pay for escrow — collapses supply. Sellers don't enroll, buyers can't protect themselves, trust loop fails. By inverting the gating to buyer-side, we make protection universally available while preserving subscription value via discounted rates (D-086).

### Principle 2: Verification is earned, not bought.

A seller can be Free + Verified, or Pro + Not yet verified. Verification badges and paid-tier badges are independent display elements. Verification badges appear more prominently than payment-tier badges so the market signal is trust-first. Banked: D-088 framing, D-091 verification application scope.

A paid seller is not automatically a trusted seller. Marketing copy that implies "Pro Seller = Verified Seller" is wrong and damages brand. The two are orthogonal axes.

### Principle 3: Free Sellers must always receive buyer messages.

No conversion-forcing on this. If free sellers cannot receive buyer messages, the marketplace dies — supply collapses, no buyer demand survives. Banked: D-091.

Free Sellers get: profile, listings, in-app inbox, full buyer message access, verification application, report/block tools, mark-as-sold flow. Future paid tiers add tools (analytics, boosts, response metrics, storefront customization) — they do not gate the core inbound communication path.

### Principle 4: Paid promotion never overrides trust quality.

Boost ranking considers verification status, listing quality, response rate, report history, freshness, plan tier, AND boost status — boost alone cannot push bad sellers to top. Featured Seller placement is gated on verification + reply rate ≥70% + zero open reports (no exceptions, even at higher boost spend).

Banked: D-091 boost eligibility, and the Featured Seller restriction documented in MONETIZATION-PLAN.md.

The rule is simple: a verified seller with good reply rate beats an unverified seller with high boost spend. Pay-to-rank is incompatible with trust-first marketplaces.

### Principle 5: Prices must always be visible.

"DM for price" is not allowed on any listing. The platform name commits the product to a principle: ShowMePrice. The `products.price_kobo` column is `NOT NULL` and listing creation forms require a price field; there is no path to publish a listing without a visible price.

This principle is structural — it shapes search relevance, comparison shopping, buyer expectations, and the trust positioning. A platform where buyers must ask for prices is functionally just an Instagram DM funnel; we are not building that.

### Principle 6: Trust & safety operates equally regardless of tier.

Operational response speed varies by tier; dispute fairness does not. All escrow disputes get the same review regardless of who pays. Banked: D-089.

Concretely: a Free Buyer's complaint against a Pro Seller is investigated with the same evidentiary rigor as a Pro Buyer's complaint against a Free Seller. Case reviewers see tier metadata segregated from the evidence-review surface to prevent unconscious bias. Public-facing copy: *"We respond faster to Pro members; we resolve every dispute the same way."*

This principle protects the trust-first brand thesis from being undermined by paid tier perks — a marketplace that sells dispute outcomes is not a trust-first marketplace.
