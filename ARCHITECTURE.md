# ARCHITECTURE.md

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) | Officially supported by @cloudflare/next-on-pages; SSR for SEO |
| Language | TypeScript strict | Type safety |
| Styling | Tailwind CSS v3 | Stable, well-supported |
| Database | Supabase Postgres + RLS | Mature, Naira-friendly, generous free tier |
| Auth | Supabase Auth (`@supabase/ssr`) | SSR-first |
| ORM/types | Drizzle | Type-safe schema, migrations, generated types |
| Edge-runtime queries | `@supabase/supabase-js` via `@supabase/ssr` | fetch-based, RLS-aware, runs on Cloudflare Pages Functions |
| Node-runtime queries | Drizzle + `postgres-js` (`src/lib/db.ts`) | Scripts, seed, drizzle-kit only — `postgres-js` doesn't run on edge (D-019) |
| Validation | Zod | Forms + server actions |
| Forms | React Hook Form | Stable, ergonomic |
| Payments | Paystack | Nigerian market standard |
| Hosting | Cloudflare Pages | Edge performance, free tier, familiar |
| Deployment | `@cloudflare/next-on-pages` + Pages Git integration | Auto-deploy on push to main |

## Rendering strategy

- **Marketplace pages** (`/`, `/marketplace`, `/listings/[slug]`, `/sellers/[handle]`): SSR with `export const runtime = "edge"`. Server-rendered HTML for crawlers + speed.
- **Authenticated pages** (`/dashboard`, `/admin`): SSR with auth check in layout.
- **Forms and interactive flows** (filters, image upload, reveal): client components within server pages.

## Data flow

All edge-runtime paths (1-4 below) use the Supabase JS client. The Drizzle pooled client is reserved for Node contexts (seed scripts, `drizzle-kit`, any future Node-runtime API route).

1. **Public pages (edge):** Server Component → `createClient()` from `src/lib/supabase/server.ts` → `.from(...).select()` against PostgREST → render HTML.
2. **Authenticated pages (edge):** Server Component reads cookie session → `supabase.server` with auth context → renders.
3. **Mutations (edge):** Server Actions → Supabase mutation → `revalidatePath()` for affected pages.
4. **Realtime (messaging) (edge):** Client Component subscribes to Supabase Realtime channel.
5. **Scripts / migrations (Node):** Drizzle pooled client from `src/lib/db.ts` connects via the Session Pooler (D-018).

## Key flows (later phases)

- **Sign up as buyer:** Supabase Auth → row in `profiles` with `user_type='buyer'` → redirect to home.
- **Become a seller:** Buyer fills business profile → row in `businesses` with `verification_status='pending'` → ID verification → bank account → admin approval → `verification_status='verified'`.
- **Browse listings:** SSR listing pages with full metadata + JSON-LD.
- **Contact reveal:** Buyer clicks reveal → server action checks Pro tier → returns WhatsApp/phone → client renders `wa.me/...` and `tel:...` links.

## SEO architecture

- All listing and seller pages SSR'd
- Per-page metadata via Next.js `generateMetadata`
- Per-listing Open Graph image using the listing's primary photo
- Dynamic sitemap (`app/sitemap.ts`) pulling from Supabase
- JSON-LD Product schema on listing pages, LocalBusiness on seller pages
- `robots.txt` allows Googlebot, blocks `/admin/*`

This is the architectural fix that justifies the rebuild from v1's Vite SPA.

## Why Pages instead of Workers (Cloudflare's newer recommendation)

Cloudflare's current recommendation for Next.js apps is OpenNext on Workers. We deliberately chose Pages because:

- Owner familiarity (v1 deployed via Pages)
- Auto-deploy on git push via dashboard connection (no `wrangler` CLI)
- `@cloudflare/next-on-pages` is functional and supports Next.js 14
- A prior attempt at Workers + OpenNext + Next.js 16 produced cascading Windows-symlink and pnpm-bundler bugs not present on the Pages path

This trade-off is recorded as D-014 and revisited if Cloudflare's deprecation timeline becomes urgent.
