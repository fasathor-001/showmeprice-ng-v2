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

## Naming conventions

- Database columns: `snake_case` (e.g. `user_type`, `verification_status`, `whatsapp_number`)
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
