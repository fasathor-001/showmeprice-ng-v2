# ShowMePrice.ng v2

Nigeria's verified marketplace. v2 rebuild on Next.js 14 + Supabase + Cloudflare Pages.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS v3
- Supabase (Postgres, RLS, Auth, Edge Functions)
- Cloudflare Pages via `@cloudflare/next-on-pages`
- Paystack for payments (NGN only)

## Development

```bash
pnpm install
cp .dev.vars.example .dev.vars   # fill in Supabase credentials when Phase A lands
pnpm dev
```

## Build gate

Every commit must pass:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Deployment

Cloudflare Pages auto-deploys on push to `main` (via the GitHub connection in the Cloudflare dashboard). No CLI deploy command needed.

For local preview of the production build:

```bash
pnpm cf:build      # produces .vercel/output/static
pnpm cf:preview    # serves the production build locally
```

## Documentation

Start here, in this order, every session:

- `CLAUDE.md` — required reading for every agent session
- `AGENT.md` — working discipline rules
- `ARCHITECTURE.md` — stack and data flow
- `DECISIONS.md` — locked architectural choices
- `ROADMAP.md` — phased build order
- `KNOWN_ISSUES.md` — tracked bugs
- `MEMORY.md` — lessons learned
- `docs/RUNBOOK.md` — operational procedures
- `docs/WORKFLOW.md` — collaboration model

## Status

Kickoff complete. Schema design (Phase A) is next.
