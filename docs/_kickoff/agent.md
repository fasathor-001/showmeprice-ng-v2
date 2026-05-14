# ShowMePrice.ng v2 — Kickoff (Cloudflare Pages + Next.js 14)

> **Historical record.** This is the kickoff spec, preserved verbatim as
> pasted by the planner. It supersedes an earlier (reverted) Workers +
> OpenNext + Next.js 16 attempt — see `DECISIONS.md` D-014 and the
> "Earlier-attempt lessons" section of `MEMORY.md` for context.

Paste to a fresh coding agent session. Working directory: `C:\Users\fasat\showmeprice-ng-v2\`. The agent's first action is to wipe everything in that folder and start fresh.

## Your role

You are a senior frontend engineer joining a new project on day zero. The previous contents of this folder were a failed attempt on a different deployment path. We are starting clean on a different stack.

You will not write application code in this session. Not a single page, route, schema migration, component, or auth flow beyond what `create-next-app` scaffolds. Resist the temptation to start building.

This session has three deliverables:

1. A working Next.js 14 + Tailwind CSS + TypeScript project shell, configured to deploy to Cloudflare Pages via `@cloudflare/next-on-pages`
2. A set of on-disk documents that encode every important decision, lesson, workflow, and runbook from a prior failed attempt
3. A clear structured report at the end

After this session, the agent in the next session will design the database schema, with full context loaded from the documents you write here.

## Hard constraints

- Do not write application code beyond `create-next-app` defaults
- Do not create a Supabase schema or migration
- Do not add authentication
- Do not install npm packages beyond what this spec explicitly names
- Do not deploy. Owner connects the Pages project via Cloudflare dashboard.
- Do not push to any remote. Owner pushes after review.
- All commits stay local until owner pushes.
- Build gate (`pnpm typecheck`, `pnpm lint`, `pnpm build`) must pass before commits.

If something in this spec is genuinely ambiguous and unresolvable from the document, stop and ask the planner through the owner. Do not guess. The cost of asking is one round trip; the cost of guessing is a failed deploy.

## Pre-answered environment facts (do not re-litigate)

- Node version: v20.x.x required. Cloudflare Pages build runtime is Node 20. The owner has Node 22 currently installed and will downgrade to Node 20 before this session runs, OR will use nvm-windows to switch. The agent verifies and stops if Node is not 20.x.
- pnpm version: 9.x.x. Already installed at 9.15.9.
- Directory: `C:\Users\fasat\showmeprice-ng-v2\` is the project root. There may be leftover files from a prior attempt. Wipe them all in Step 0.
- Stale agent context: if any tooling auto-loads a `CLAUDE.md` from outside this folder (e.g. `C:\Users\fasat\Pictures\app\`), ignore it. The only authoritative context is `agent.md` (this spec) and the documents you're about to write.

## Project context

### What ShowMePrice.ng is

A Nigerian C2C/B2C marketplace where verified sellers post products with real prices and buyers contact them directly via WhatsApp or phone. The pitch: solving the "DM for price" problem on Instagram and similar channels.

The conversion event is the contact tap (WhatsApp or phone reveal), not a checkout. There is an optional escrow rail for buyers who want protection, but the platform monetises via seller tier subscriptions (Pro), not transactional cuts.

Users are buyers, sellers, or admins. Sellers are buyers who completed an upgrade flow (profile → ID verification → bank account → admin approval). Sellers retain buyer abilities. This is Model B — "seller" is a superset of "buyer," not a mutually-exclusive switch.

### v1 context (relevant only for context)

A v1 of this site exists at `https://showmepriceng.pages.dev`. It was built as a Vite + React SPA on Supabase. It works but has architectural issues. v2 is a clean rebuild on Next.js + a fresh Supabase project. We carry the brand, domain understanding, and lessons. We do not carry the v1 implementation.

### Stack decisions (locked, do not relitigate)

- Framework: Next.js 14 with the App Router
- Language: TypeScript, strict mode
- Styling: Tailwind CSS v3 (NOT v4)
- Database: Supabase (Postgres + RLS + Auth + Edge Functions + Realtime). Fresh project, to be set up in Phase A.
- Hosting: Cloudflare Pages via `@cloudflare/next-on-pages`
- Package manager: pnpm 9.x
- Payments: Paystack (NGN only)
- Auth library: `@supabase/ssr`
- Validation: Zod
- Forms: React Hook Form
- Icons: lucide-react
- Animation: motion, used sparingly
- Database ORM/types: Drizzle for migrations and TypeScript types; Supabase client for runtime queries. Drizzle setup is Phase A's job.

If you would like to suggest a different choice, stop and propose it via the owner.

### Earlier attempts and why this restart exists

Earlier today we attempted v2 on Cloudflare Workers via OpenNext + Next.js 16. The agent's discipline was correct — it flagged every ambiguity properly. But the path itself produced cascading issues:

1. Windows + OpenNext required Developer Mode for symlinks
2. pnpm's symlinked node_modules confused the OpenNext bundler, producing dynamic `require()` calls that Workers' V8 isolate cannot execute
3. The `workers.dev` URL was unfamiliar to the owner

The owner explicitly chose to revert to Cloudflare Pages (`pages.dev`), the deploy path used in v1. The supported framework version on `@cloudflare/next-on-pages` is Next.js 14 (Next.js 15 has caveats, Next.js 16 is unsupported). We pin to Next.js 14 deliberately.

This is encoded in `DECISIONS.md` as D-001 (the rebuild decision) and D-014 (the choice of Pages over Workers). Both are in the documents below.

## What you will do in this session, in order

### Step 0 — Wipe the workspace clean

From `C:\Users\fasat\showmeprice-ng-v2\`:

```powershell
Get-ChildItem -Path . -Force | Remove-Item -Recurse -Force
```

Then verify:

```powershell
Get-ChildItem -Force
```

Should return nothing (empty folder). If anything remains, stop and report.

### Step 1 — Verify environment

```powershell
node --version
pnpm --version
git --version
```

Expected: Node `v20.x.x`, pnpm `9.x.x`, git any recent.

If Node is not 20.x, stop and report. The owner must install Node 20 LTS before proceeding. Do not attempt the bootstrap on Node 22 — Cloudflare Pages builds on Node 20 and a local-vs-deploy version mismatch produces subtle bugs.

### Step 2 — Bootstrap Next.js 14 directly into the current folder

`create-next-app@latest` now defaults to Next.js 16. We need Next.js 14 explicitly. Use the version-pinned bootstrap:

```powershell
pnpm create next-app@14 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

The trailing `.` installs into the current folder. The `@14` pins create-next-app itself, which in turn installs Next.js 14.

If `create-next-app` prompts for anything not covered by flags, accept the safest default. Note any non-default answers in the final report.

After it finishes:

```powershell
git init
git add .
git commit -m "chore: bootstrap Next.js 14 + TypeScript + Tailwind v3 + App Router"
```

### Step 3 — Configure for Cloudflare Pages

Install the Pages adapter and tooling:

```powershell
pnpm add -D @cloudflare/next-on-pages wrangler vercel
pnpm add -D prettier prettier-plugin-tailwindcss
```

Replace the `scripts` block in `package.json` with:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "format": "prettier --write \"src/**/*.{ts,tsx,css}\" \"*.{ts,js,json,md}\"",
  "format:check": "prettier --check \"src/**/*.{ts,tsx,css}\" \"*.{ts,js,json,md}\"",
  "cf:build": "npx @cloudflare/next-on-pages",
  "cf:preview": "npx @cloudflare/next-on-pages && npx wrangler pages dev .vercel/output/static"
}
```

Note: there is no `cf:deploy` script. Deploys are handled by Cloudflare Pages' Git connection — the owner connects the GitHub repo to a Pages project via the Cloudflare dashboard, and every push to `main` auto-deploys.

Pin Node and pnpm in `package.json`:

```json
"engines": {
  "node": ">=20.0.0 <21.0.0",
  "pnpm": ">=9.0.0 <10.0.0"
},
"packageManager": "pnpm@9.15.9"
```

Create `.nvmrc` at repo root with exactly:

```
20
```

This tells Cloudflare Pages (and nvm) which Node version to use.

Create `.prettierrc` at repo root:

```json
{
  "plugins": ["prettier-plugin-tailwindcss"],
  "semi": true,
  "singleQuote": false,
  "trailingComma": "es5",
  "printWidth": 100
}
```

Create `wrangler.toml` at repo root (for local preview only — production deploys don't use this):

```toml
name = "showmeprice-ng-v2"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = ".vercel/output/static"
```

Create `.dev.vars.example` at repo root:

```
# Supabase — fresh project, to be created in Phase A
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Paystack — to be added in Phase G (Pro upgrade)
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=
```

Append to `.gitignore`:

```
.dev.vars
.vercel
.wrangler
.open-next
```

Commit:

```powershell
git add .
git commit -m "chore: configure Cloudflare Pages deployment, Prettier, engine pins"
```

### Step 4 — Tailwind tokens (provisional) and clean home page

The design pass before Phase B will revise these. For the kickoff, set up structure with the brand baseline.

In `tailwind.config.ts` (or `.js`, whichever was produced — pick the one that exists):

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        teal: {
          DEFAULT: "#2D9D9F",
        },
        ink: {
          DEFAULT: "#0B1220",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
```

Replace `src/app/globals.css` content with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  color: #0B1220;
  background: #ffffff;
}
```

Replace `src/app/layout.tsx` with (keep the existing Inter font setup if create-next-app provided it; this version uses a clean baseline):

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "ShowMePrice.ng",
  description: "Nigeria's verified marketplace.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans`}>{children}</body>
    </html>
  );
}
```

Replace `src/app/page.tsx` with:

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-ink">
          ShowMePrice<span className="text-teal">.ng</span>
        </h1>
        <p className="mt-2 text-sm text-neutral-500">v2 foundation — kickoff complete</p>
      </div>
    </main>
  );
}
```

Smoke-test locally:

```powershell
pnpm dev
```

Open `http://localhost:3000`, confirm the page renders with the teal `.ng` accent and no console errors. Then stop the dev server (Ctrl+C).

Commit:

```powershell
git add .
git commit -m "chore: provisional design tokens and clean home page"
```

### Step 5 — Author the eleven on-disk documents

Reproduce each file verbatim. These encode every important decision and lesson learned in a prior failed attempt. Do not improvise; copy exactly.

Create `docs/` and `docs/_kickoff/` first:

```powershell
New-Item -ItemType Directory -Force -Path docs, docs\_kickoff | Out-Null
```

Preserve this spec verbatim at `docs/_kickoff/agent.md` (the agent will paste the entire spec content the owner provided).

The eleven on-disk documents are: `README.md`, `CLAUDE.md`, `AGENT.md`,
`ARCHITECTURE.md`, `DECISIONS.md`, `ROADMAP.md`, `KNOWN_ISSUES.md`,
`MEMORY.md`, `docs/RUNBOOK.md`, `docs/WORKFLOW.md`, and this preserved
spec at `docs/_kickoff/agent.md`. The verbatim contents for each were
specified in the original spec and live as standalone files at the repo
root (or under `docs/`). See each file for its authoritative current
content.

### Step 6 — Build gate

```powershell
pnpm typecheck
pnpm lint
pnpm build
```

All three must pass. If any fail, stop and report — don't commit a failing build.

### Step 7 — Commit the docs

```powershell
git add .
git commit -m "docs: foundation — CLAUDE, AGENT, ARCHITECTURE, DECISIONS, ROADMAP, KNOWN_ISSUES, MEMORY, RUNBOOK, WORKFLOW"
```

### Step 8 — Owner next steps (instructions, do not execute)

In the final report, give the owner this checklist:

```
Local repo is ready. To go live:

1. Create a new private GitHub repo named `showmeprice-ng-v2` (owner already has one from a prior attempt — can reuse or create new).
2. From this directory:
   git remote add origin https://github.com/fasathor-001/showmeprice-ng-v2.git
   git branch -M main
   git push -u origin main

   (If `origin` already exists from a prior attempt, run `git remote remove origin` first.)
   (If pushing to an existing repo with prior history, may need `git push -u origin main --force` — but only after confirming with the planner.)

3. In Cloudflare dashboard:
   - Workers & Pages → Create application → Pages → Connect to Git
   - Select `showmeprice-ng-v2` repo
   - Production branch: main
   - Framework preset: Next.js
   - Build command: pnpm install && pnpm cf:build
   - Build output directory: .vercel/output/static
   - Environment variables: NODE_VERSION=20
   - Compatibility flags: nodejs_compat (both Production and Preview)
   - Save and Deploy

4. The first build takes 2–5 minutes. URL will be https://showmeprice-ng-v2.pages.dev

5. Every subsequent `git push origin main` auto-deploys.
```

## Final report format

Send back one structured message:

```
KICKOFF COMPLETE (v2 take 2 — Cloudflare Pages + Next.js 14)

ENVIRONMENT
- Node: v20.x.x
- pnpm: 9.x.x
- OS: Windows 11

WORKSPACE WIPE
- Removed: [list everything that was deleted]
- Folder now contains only this session's commits

PROJECT CREATED
- Path: C:\Users\fasat\showmeprice-ng-v2\
- Bootstrap command used: [exact command]
- Next.js version installed: [confirm 14.x.x]
- Non-default prompts from create-next-app: [list any]

COMMITS (local, not pushed)
1. [hash] chore: bootstrap Next.js 14…
2. [hash] chore: configure Cloudflare Pages deployment, Prettier, engine pins
3. [hash] chore: provisional design tokens and clean home page
4. [hash] docs: foundation — CLAUDE, AGENT, ARCHITECTURE, DECISIONS, ROADMAP, KNOWN_ISSUES, MEMORY, RUNBOOK, WORKFLOW

LOCAL DEV CHECK
- pnpm dev: opens at localhost:3000 → home page renders with teal accent → no console errors

BUILD GATE
- pnpm typecheck: PASS
- pnpm lint: PASS
- pnpm build: PASS

DOCS WRITTEN
- README.md ✓
- CLAUDE.md ✓
- AGENT.md ✓
- ARCHITECTURE.md ✓
- DECISIONS.md ✓ (D-001 through D-014, with D-012/D-013 intentionally skipped)
- ROADMAP.md ✓
- KNOWN_ISSUES.md ✓ (empty)
- MEMORY.md ✓ (v1 + earlier-attempt lessons)
- docs/RUNBOOK.md ✓
- docs/WORKFLOW.md ✓
- docs/_kickoff/agent.md ✓ (this spec preserved verbatim)

QUESTIONS / FLAGS FOR PLANNER
[Anything ambiguous, any default chosen, any concern]

OWNER NEXT STEPS
[Reproduce the 5-step checklist from Step 8]
```

## HARD STOP

After the report:

- Do not start Phase A
- Do not add any application logic
- Do not push to GitHub (owner pushes)
- Do not set up Cloudflare Pages (owner does this in dashboard)

Wait for the planner.
