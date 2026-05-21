# Agent Handoff — Operating Manual

> **Read me after `CLAUDE.md`.** `CLAUDE.md` is the auto-loaded entry point; it
> links here. This is the consolidated operating manual for any agent (or human)
> joining ShowMePrice.ng. It **orients and indexes** — it does not duplicate the
> canonical docs. When this doc and a canonical doc disagree, the canonical doc
> wins for specifics; fix the drift here (see §9).
>
> **Last reviewed:** 2026-05-21.

## §0 — How to use this doc + the document map

| Doc | Owns |
|---|---|
| `CLAUDE.md` | Auto-loaded entry point + mandated read-order. Points here. |
| `docs/agent-handoff.md` (this) | Orientation, disciplines index, anti-patterns, session protocols. |
| `docs/WORKFLOW.md` | The owner ↔ planner ↔ agent collaboration loop (spec → execute → report). |
| `docs/RUNBOOK.md` | How to perform common operations. |
| `DECISIONS.md` | Every locked decision (D-001…). The "why." |
| `MEMORY.md` | Lessons learned + the 6 Banked Principles. The "what we know." |
| `KNOWN_ISSUES.md` | Open + resolved issues (K-001…). |
| `ACTUAL_SCHEMA.md` | Verified DB schema. The "what's actually deployed." |
| `PHASE_E_SPEC.md` | Current phase spec (versioned). |
| `docs/journal/` | Per-session journals — continuity across sessions. |

This doc is **durable process**. Live state (current phase, commits, in-flight)
comes from the §3 session-open summary, never from static text here.

## §1 — Project identity (durable facts only)

- **Product:** ShowMePrice.ng — a Nigerian trust-first marketplace where verified
  sellers post products with real prices and buyers contact them through a safer,
  logged transaction flow. Primary marketplace conversion is buyer-seller
  engagement: inquiry, offer, official contact reveal, and escrow start on eligible
  high-value transactions — not a generic cart checkout. Monetisation starts with
  buyer Pro/credit packs + escrow fees, then expands into seller Pro, boosts,
  institution plans, and logistics. Currency: NGN only.
- **Team:** solo founder (Frank) — CAC-registered NG entity, founder based in
  South Africa, operating from residence. No permanent engineering team; continuity
  lives in the canonical docs (§0) + AI agents.
- **Stack:** Next.js 14 (App Router) · Cloudflare Pages (Edge runtime) · Supabase
  (Postgres + Auth + Storage + RLS) · Drizzle ORM · pnpm · Node 20.
- **Repo:** `C:\Users\fasat\showmeprice-ng-v2\` · **Deploy:** https://showmeprice-ng-v2.pages.dev · **Marketing:** showmeprice.ng
- *(Current phase/stage is intentionally NOT recorded here — see §3.)*

## §2 — The two-agent split (see `WORKFLOW.md` for the full loop)

Two AI roles + the human, per `docs/WORKFLOW.md`:

- **Planner / strategy role:** writes specs, reviews, banks decisions, refines
  product framing. Never touches files directly. Currently filled by ChatGPT or
  Claude conversations.
- **Coding agent role:** reads docs, writes code, runs typecheck, commits. Never
  decides *what* to build. Currently filled by Claude Code.
- **Owner (Frank):** human-only actions; ultimate decider.

The split exists because pure code-execution agents tend to dive into
implementation without enough surfacing. By separating "what to build" (planner)
from "how to build" (agent), each role has clearer accountability and conflicts
surface naturally between them rather than getting absorbed silently. The owner
(Frank) is the ultimate decider — both the planner and agent serve the owner's
intent. Understanding *why* makes the discipline self-enforcing.

**Human-only actions** (never delegate without explicit owner authorization):
- Supabase production migrations (Frank executes via SQL Editor)
- GitHub push / deploy approval
- Live vendor credential changes (API keys, sender IDs, webhook secrets)
- Production data fixes
- Pricing / business-rule changes

These are owner-only because they touch production state, money, or trust
commitments. An agent should **propose, draft, and verify** — but the owner executes.

The one durable principle that governs the split: **surface, don't absorb.** If a
request contradicts a banked decision or the spec, the agent **stops and names the
conflict** through the owner — it never silently implements a different design.
Full loop, spec/report formats, and phase boundaries: `docs/WORKFLOW.md`.

## §3 — Session-open pre-work (the canonical read-order)

**Read all 8 items in this order. Do not skip any. Do not skim past §1–§6 of any
file assuming you've "got the gist" — the details in those files are why we're not
relearning the same lessons.**

1. `CLAUDE.md` → `docs/agent-handoff.md` (this)
2. `PHASE_E_SPEC.md`
3. `MEMORY.md`
4. `DECISIONS.md` (skim to the latest D-number)
5. `KNOWN_ISSUES.md`
6. `ACTUAL_SCHEMA.md`
7. The latest entry in `docs/journal/`
8. `git log --oneline -15`

Then return a grounding summary (template in §7) covering: **phase/stage + status,
last 5 commits, in-flight work, blockers, disciplines acknowledged.** **Do not start
task work until the owner acknowledges the summary.** This single step is the biggest
defense against session-to-session drift.

## §4 — Discipline index (content lives in the canonical docs)

Scan here, click through for the full lesson. Do **not** restate these in this doc.

| Discipline | Canonical location |
|---|---|
| Surface findings before implementing; surface conflicts, don't absorb | `WORKFLOW.md` (Conflict resolution); `MEMORY.md` "Surface design conflicts against banked decisions" |
| Verify *actual* deployed state, not apparent success (paste-back) | `MEMORY.md` "Verify actual deployed state, not apparent success" |
| Do NOT invent product strategy — surface for decision-banking | §5 (this doc); `DECISIONS.md` |
| No silent schema assumptions — verify against live schema | §5 (this doc); `MEMORY.md` "Agent-vs-DB state divergence", "The migrations folder is not the database" |
| DB-first, code-second | `MEMORY.md` "DB-first / code-second" |
| Pre-flight + verification queries on every migration (§0/§1/§2) | `MEMORY.md` "Pre-flight column-coverage…", "Synthetic-scenario verification…" |
| Triple-REVOKE on SECURITY DEFINER (anon + authenticated + PUBLIC → grant service_role) | `MEMORY.md` "SECURITY DEFINER lockdown needs explicit anon + authenticated REVOKEs" |
| No direct UPDATE on trigger-protected columns (`businesses.verification_status`) | `MEMORY.md` "`businesses.verification_status` is trigger-frozen" |
| `revalidatePath` is a no-op/banned on Cloudflare edge | `MEMORY.md` "`revalidatePath` ban…"; `KNOWN_ISSUES.md` K-012 |
| Bank decisions before they drift (numbered D-XXX) | `DECISIONS.md` |
| Single coherent commit per change; typecheck before commit | `WORKFLOW.md` (report format); project commit history |
| Use existing patterns before inventing (e.g. `src/lib/payments/` → `src/lib/otp/`) | `MEMORY.md` (helper-extraction lessons); read siblings first |
| Keep the canonical docs current | §9 + `MEMORY.md` meta-discipline |

## §5 — Anti-patterns to avoid (concrete failure modes)

- **Diving into code before reading existing patterns.** Always read the sibling module first (the `src/lib/payments/` → `src/lib/otp/` precedent saved a re-invention).
- **"It typechecked, so it works."** Typecheck is necessary, not sufficient. Runtime/integration bugs (edge `revalidatePath`, FK names, vendor response shapes) pass typecheck.
- **Silently overriding a banked decision.** Name the conflict; get an explicit re-bank.
- **Mega-commits** mixing migration + business logic + UI. One coherent change per commit.
- **Trusting search-engine answers over actual vendor docs.** (The Arkesel sender-ID rejection caught a training-based assumption.) Verify against live docs / live responses.
- **Assuming env vars are loaded correctly.** Confirm via terminal output or a test call.
- **Skipping verification queries because "the migration succeeded."** No error ≠ intended state (the SECURITY DEFINER grant gap was invisible to migration success).
- **Treating a *description* of code as the code.** For review, paste the actual file/SQL text — relayed tool output may not reach the planner.
- **Inventing product strategy while coding.** If a task implies a new pricing rule, trust rule, verification rule, escrow rule, category structure, buyer/seller entitlement, or moderation consequence — **stop and surface it for owner/planner decision-banking.** Product rules belong in `DECISIONS.md` *before* they appear in code. Examples that must NOT be invented mid-task: daily caps on reveals/messages/actions; auto-verification rules ("verify users with X domain"); Pro-tier entitlements not already banked; block/unblock policy (silent vs visible, scope, reversibility); category additions/merges; pricing changes; moderation thresholds.
- **Coding against assumed schema (silent schema assumptions).** Before writing DB-dependent code, verify the table/column/policy/function exists. Trust hierarchy for "is this in the deployed schema?": (1) live `information_schema` query — most trustworthy, actual deployed state; (2) `ACTUAL_SCHEMA.md` — canonical record if recently updated; (3) Drizzle schema files — should match deployment but can drift; (4) TypeScript types — derived, can be stale; (5) spec documents — planned, may not be deployed. When uncertain, query the live schema. Do not code against (3)–(5) alone.

## §6 — Signal vocabulary

**Good-behavior phrases:** "Let me read the file first…" · "I want to surface a
finding before writing code…" · "Before I implement, I want to verify…" · "I'm
pushing back on this because…" · "Let me check the existing pattern."

**Drift phrases (watch out):** "I'll fix this and also clean up…" (scope creep) ·
"Trust me, this is fine" (verify instead) · "We can come back to that later" (often
never) · "It typechecked so it should work" (insufficient) · long descriptions of
what was *done* with nothing about what was *verified*.

## §7 — Session-opening protocol (templates)

**Owner's opening prompt:**
```
Working on ShowMePrice.ng. Before we proceed, read (per docs/agent-handoff.md §3):
agent-handoff.md, PHASE_E_SPEC.md, MEMORY.md, DECISIONS.md, KNOWN_ISSUES.md,
ACTUAL_SCHEMA.md, the latest docs/journal/ entry. Run git log --oneline -15.
Summarize back: phase, last 5 commits, in-flight, blockers, disciplines you'll
follow. If anything in those docs is unclear or contradictory, name it in your
summary — don't paper over inconsistencies. Wait for my next instruction.
```

**Agent's grounding summary:**
```
Grounded. Current state:
- Phase: [X] Stage [Y] [status]
- Last 5 commits: [list]
- In-flight: [list or "clean state"]
- Blockers: [list or "none"]
- Disciplines acknowledged: surface-before-implement, verify-actual-state,
  no-invented-product-strategy, no-silent-schema-assumptions, DB-first,
  single-coherent-commits, decision-banking, triple-revoke-SECURITY-DEFINER,
  no-protected-table-UPDATE, use-existing-patterns.
- Contradictions/unclear found: [list or "none"]
Ready for next instruction.
```

## §8 — Session-closing protocol + journal convention

At session end, the agent **proposes** (owner confirms) a journal entry:
- **Location/filename:** `docs/journal/YYYY-MM-DD-<short-topic>.md`
  - topic = 3–5 words, hyphenated, lowercase; multiple sessions/day get an `-am`/`-pm` or numeric suffix.
  - Greppable; each becomes the next session's first read (§3 step 7).
- **Contents:** session date + commit range · what shipped · what's in-flight at session end · open questions / next-session entry point · any decisions made but not yet banked · **any new files or patterns introduced that should be referenced from `agent-handoff.md` or `MEMORY.md`.**

## §9 — Maintaining this document

- This doc is **durable process/orientation**. Routing rule: a **decision** → `DECISIONS.md`; a **lesson/gotcha** → `MEMORY.md`; a **bug** → `KNOWN_ISSUES.md`; **schema** → `ACTUAL_SCHEMA.md`. This doc only **indexes** them.
- Update the **Last reviewed** stamp (top) when you touch it.
- **If this document doesn't match how we actually work, fix the drift explicitly.** Either update the doc to match reality, or change behavior to match the doc — but never run silently differently from what's written here. A doc that says X while behavior is Y, with neither acknowledging the other, is a third drift pattern and the worst outcome. Resolve it in a commit.

## §10 — Vendor relations context (durable)

ShowMePrice integrates with multiple Nigerian and African vendors. Each has its own
onboarding friction class. This is durable context (not "current status") about what
to expect:

- **SMS providers (Termii, Arkesel, etc.):** All NG SMS providers gate sender IDs
  behind approval workflows. Approval typically requires a live website + documented
  use case. Plan for 1–7 days between request and approval. The provider abstraction
  (D-094) is what makes vendor swaps cheap — never let vendor-specific concepts leak
  into application code.
- **Payment processors (Paystack, Korapay, etc.):** All NG payment processors require
  KYC documentation, often including utility bills in the business name (which new
  businesses don't have). Common workarounds: tenancy agreement, CAC certificate,
  bank statement with business address. Allow 3–14 days for KYC clearance.
- **Identity verification (NIN providers):** Same provider-abstraction pattern as
  payments — multiple vendors with different APIs, swap-ready via env var.

**General rule:** when a vendor gates a feature, that's vendor friction, not project
failure. The provider abstraction exists so you can swap when frustrated. Don't
redesign around a single vendor's quirks — the next vendor will have different ones.

> If this section grows past ~500 words or covers more than 4–5 vendor classes,
> split to `docs/vendor-context.md` per the §9 routing rules and keep this section
> as a pointer.
