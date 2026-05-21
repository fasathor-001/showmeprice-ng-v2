# PROMPT FOR CODING AGENT — PHASE E EXECUTION

> **HISTORICAL — SUPERSEDED.** This document was the agent orientation prior to
> `docs/agent-handoff.md`. Current orientation lives at `/docs/agent-handoff.md`.
> This file is preserved for historical reference (decisions made under the prior
> framework) but should NOT be used as current operating instructions.

Copy and paste the section below into Claude Code (or your coding agent of choice) to begin Phase E implementation.

---

## START OF PROMPT

You are picking up the ShowMePrice.ng project for Phase E implementation. Phase D shipped successfully (25 commits across categories, images, CRUD, search). You are now building Phase E: buyer-side infrastructure and Pro tier monetization.

### Your starting context

**Local repo:** `C:\Users\fasat\showmeprice-ng-v2\`

**Stack:** Next.js 14 App Router on Cloudflare Pages Edge, Supabase Postgres + Auth + Storage + Realtime, Drizzle ORM, @supabase/ssr, pnpm 9.15.9, Node 20.

**Canonical docs in repo (read these FIRST before writing any code):**
- `ACTUAL_SCHEMA.md` — current database schema
- `DECISIONS.md` — every architectural decision D-001 through D-053
- `MEMORY.md` — accumulated working memory across phases
- `KNOWN_ISSUES.md` — open issues; **K-011 must be your first fix**

### Your specification

The complete Phase E specification is in `PHASE_E_SPEC.md` (provided alongside this prompt). This is your authoritative source for all decisions. Read it end-to-end before starting any work. It contains:

- Strategic positioning and tier roadmap
- All 32 architectural additions across 3 buckets (critical schema, empty schemas, logging tables)
- Detailed specs for buyer auth, messaging, Pro tier, Paystack, moderation, admin tooling
- Build sequence with 9 stages across ~20 weeks
- Smoke test plans per section
- Forward-phase commitments (Phase F+, G+, H+)

### Your execution rules

**1. Read the spec end-to-end before writing any code.** Do not skim. Do not pattern-match on familiar features. The spec contains specific architectural decisions (admin-editable filter rules, payment provider abstraction, conversation_type for future admin messaging, case_id nullable foreign keys, etc.) that exist specifically to enable Phase F/G/H expansion. Skipping these to ship faster will cost months of rework later.

**2. Build in stages, smoke test each stage before proceeding.** The spec defines 9 stages. Do not jump ahead. Each stage's smoke test must pass before starting the next.

**3. First task: fix K-011 (PKCE cross-browser email confirmation bug).** All buyer auth depends on this. Do not start buyer auth until K-011 is resolved.

**4. Schema migrations come before features.** The spec defines tables across §4-§18. Create all migrations in Stage 1 before writing application code. This includes empty-schema tables for Phase G+/H+ features — yes, create them now even though they have no data.

**5. The `PaymentGateway` interface is mandatory.** Do not write `paystack.charge(...)` calls scattered through the codebase. Wrap Paystack behind the interface. This is non-negotiable for Phase F+ multi-provider support.

**6. The `filter_rules` table is read at runtime, not hardcoded.** PII filter patterns live in the database, not in code. This enables admin tuning without deploys.

**7. Pro framing is "service for serious buyers," not "paywall."** Every Pro-related copy decision uses this frame. The spec §11 has the exact marketing copy guidelines.

**8. Update canonical docs as you go.** When you add a table, update `ACTUAL_SCHEMA.md`. When you make a decision, add it to `DECISIONS.md` (D-054 onwards). Don't wait until the end.

**9. Ask the planner (the human) when ambiguity arises.** Do not invent decisions. The spec covers a lot, but production reality will surface edge cases. When in doubt, surface the question with context and proposed options rather than making a unilateral call.

**10. Maintain Phase D's commit hygiene.** Small focused commits with clear messages. Each commit smoke-tested before pushing. No "WIP" commits to main.

### Your deliverable per stage

For each of the 9 stages in the build sequence (spec §19):

1. **Schema migrations** applied to dev environment
2. **Application code** implementing the stage's features
3. **Smoke test pass** documented in commit message or PR description
4. **Doc updates** to `ACTUAL_SCHEMA.md` and `DECISIONS.md`
5. **Handoff note** to planner if any issues, edge cases, or new questions surfaced

### Your timeline expectation

Phase E is large — 18-22 weeks of focused engineering. The spec breaks it into 9 stages with explicit week ranges. Communicate timeline impacts early if reality diverges from the plan.

### Your environment

Required environment variables are listed in spec §23. Obtain Termii API key, Paystack live + test keys, and email provider credentials before starting Stage 6 (Pro tier + Paystack).

### Your starting action

1. Read `PHASE_E_SPEC.md` end-to-end
2. Read `ACTUAL_SCHEMA.md`, `DECISIONS.md`, `MEMORY.md`, `KNOWN_ISSUES.md`
3. Reproduce K-011 locally to confirm understanding
4. Propose your K-011 fix approach before implementing
5. After K-011 is shipped, propose your Stage 1 migration plan before applying

Begin with step 1. Surface any questions about the spec before starting implementation.

## END OF PROMPT
