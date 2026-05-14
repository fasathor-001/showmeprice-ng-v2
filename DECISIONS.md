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
