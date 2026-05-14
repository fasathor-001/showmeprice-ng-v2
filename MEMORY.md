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

### Peer ranges can be unsatisfiable — verify against the registry, not the package.json declaration

`@cloudflare/next-on-pages@1.13.16` declared `next >=14.3.0 <=15.5.2` as a peer range. The planner wrote a spec assuming this meant "bump Next to 14.3." The agent caught the trap: **Next 14.2.35 is the highest 14.x ever published.** After 14.2.35, Next jumped to 15.0.0 — no 14.3 ever shipped (a `14.3.0-canary.77` existed but was never promoted; canary users were told to downgrade).

Lesson: when a peer range looks weird, check `npm view <package> versions --json` against the registry to confirm the named range actually contains published versions. A package can declare an unsatisfiable peer range — usually a typo upstream. Diagnose the upstream bug; don't contort our project to fit it.

The agent's exact verification command:
```bash
npm view next versions --json | jq '[.[] | select(startswith("14."))]'
```

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
