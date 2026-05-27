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
| `docs/_*.md` (session templates) | Reusable copy-paste prompts: session open, close, recovery, decision banking. Operationalize §3, §7, §8. |

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
| Decision banking (D-XXX format) | `docs/_decision_bank.md` template; structured format established per D-104 onward |
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

For convenience, the full owner-prompt + agent-grounding-summary templates are pre-built in:
- `docs/_planner_session_open.md` — planner chat (with paste placeholders)
- `docs/_coding_agent_session_open.md` — Claude Code (paste as-is)
- `docs/_context_recovery.md` — mid-session re-grounding without a new chat

## §8 — Session-closing protocol + journal convention

At session end, the agent **proposes** (owner confirms) a journal entry:
- **Location/filename:** `docs/journal/YYYY-MM-DD-<short-topic>.md`
  - topic = 3–5 words, hyphenated, lowercase; multiple sessions/day get an `-am`/`-pm` or numeric suffix.
  - Greppable; each becomes the next session's first read (§3 step 7).
- **Contents:** session date + commit range · what shipped · what's in-flight at session end · open questions / next-session entry point · any decisions made but not yet banked · **any new files or patterns introduced that should be referenced from `agent-handoff.md` or `MEMORY.md`.**

For convenience, the full journal-entry template is at `docs/_session_close.md`.

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

## §11 — Stage 2.C operational lessons (durable)

Stage 2.C delivered working code through deep discipline alignment. Key lessons from closure work that apply to future phases:

### §11.1 — Pre-investigation verifies reality before architecture

Every commit gates on pre-investigation: verify actual DB state, file existence, cross-reference integrity, scope phantoms. Pre-investigation answers the question "Is the plan compatible with reality?" before writing code.

**Pattern:** Query `information_schema.columns`, `pg_enum`, `pg_policy`, `pg_constraint`, `pg_proc` to verify the deployed schema matches assumptions. Query source files for cross-reference existence (does the D-decision being referenced actually exist in `DECISIONS.md`?). Query canonicity: are scope items formally documented, or are they forward-projected phantoms?

**Examples from Stage 2.C:**
- **Commit 10-c:** Migration for new `notification_preferences` column failed pre-flight because the table already existed with a different structure than planned. Query caught it before architecture locked.
- **Commit 12:** Polymorphic schema for reports already pre-staged with `target_type` enum including `'listing'`. Extension required zero DDL changes — only enum extension. Pre-investigation SQL verified the enum already existed.
- **Commit A (governance):** Pre-investigation confirmed all D-125/D-126/D-127/D-128 headers resolved in canonical `DECISIONS.md` before locking migration order.
- **Commit B (operational):** Pre-investigation verified existing D-references in `RUNBOOK.md` before adding new ones, confirmed all new D-numbers mapped to real decision headers.

**Gate pattern:** For every architectural decision: (1) query live schema state, (2) verify all D-decisions referenced exist canonically, (3) check all scope items are documented or escalate phantoms, (4) only then lock the plan.

### §11.2 — Implementation-Path Independence: escalate path failure, don't substitute

When the planned implementation path becomes unavailable, escalate the path failure to the owner — do not silently substitute a partial alternative and reframe it as objective completion.

**Forbidden patterns:**
- Reframing partial work as completing the full objective ("the partial integration works, ship it")
- "Optional enhancement" framing even when high-quality ("we can do lazy-loading as an optional improvement instead")
- Silent descope: deliver a subset and claim success

**Canonical doctrine reference:** `DECISIONS.md` Operational Doctrine — Implementation-Path Independence.

**Example from Stage 2.C:** Commit 11 (K-055, next/image responsive delivery). The planned approach required Cloudflare Workers rewrite rules. Investigation found Cloudflare Pages free tier blocks custom Workers. Path failed. Agent attempted twice to reframe lazy-loading wrapper as completing the objective. Both reframes were caught at review. Correct disposition: escalate path failure, K-055 remained OPEN with explicit deferral per Implementation-Path Independence doctrine. Work may be high-quality; path failure remains discipline failure even when the quality is excellent.

### §11.3 — D-128 phase-aware decision framework: the active phase determines work

**D-128: Four-Phase Marketplace Lifecycle** defines four distinct phases (Private Beta → Marketplace Learning → Trust Intelligence → Marketplace Scale), each with explicit success criteria, distinct mindset, and forbidden anti-patterns.

**Rule:** Every agent session must know the active phase. Every task decision must ask "Is this work appropriate for the active phase?" Work optimistically planned for Phase 2 belongs in Phase 2, not Phase 1. Phase 1 anti-patterns (no public announcements, no growth hacking, no feature additions from user requests, no vanity metrics, no mass marketing) are explicitly incompatible with private beta observation goals.

**Current phase:** Private Beta (Phase 1) preparation. Phase 1 scope: small controlled invite-only cohort (10-20 invitees), observation of trust recurrence (voluntary repeat behavior, not DAU/sessions/signups). Anti-patterns: no public announcement, no social media, no Product Hunt, no press release, no mass WhatsApp broadcast, no general public sign-up.

**Cross-reference:** D-128 appears in launch-readiness-checklist.md (transition criteria), RUNBOOK.md (beta launch operations), and MEMORY.md meta-discipline (phase determines work).

### §11.4 — Verify production state before diagnosing agent context drift

When a long session produces stale or unrelated outputs, verify production state (git log, git status, recent commit) BEFORE assuming agent failure or context degradation.

**Diagnostic workflow:**
1. `git log --oneline -5` — does the recent commit match the work requested?
2. `git status` — is the working directory clean or are there unexpected changes?
3. If recent commit matches directive and working directory is clean → work completed successfully in a prior session or parallel execution; re-anchor to current directive.
4. If recent commit does NOT match directive → genuine drift; diagnose root cause or re-ground the agent.

**Why this matters:** Long sessions degrade agent context coherence. Parallel session interference is common. The work may be done already. Verifying production state first prevents false-negative diagnostics ("the agent failed to do X") when X was actually completed in a parallel session or earlier turn.

**Example from Stage 2.C:** Pre-Commit C setup, agent began verifying Commit 9-c.4 (ImageBubble CSS fix) when asked to migrate documentation. Output was internally coherent (it was a legitimate verification task from an earlier session) but unrelated to the current directive (governance documentation migration). Root cause: long session context decay. Resolution: verify production state (git log matched Commit 9-c.4 verification as completed work), acknowledged prior session context, re-anchored to Commit C directive.

### §11.5 — Escalation recursion avoidance: more investigation is not automatically certainty

When uncertain about a decision, escalate to the product owner (Frank) — do not loop into deeper investigation hoping certainty emerges.

**Pattern:** Pre-investigation findings → list open flags/uncertainties → surface for product decision → proceed. Investigation loops (deeper queries, more test scenarios, broader literature review) increase data volume but don't guarantee certainty. The diminishing returns are steep. Judgment calls belong to the owner, not to tighter investigation parameters.

**Judgment-level discipline, not rule-level:** When to escalate vs. when to resolve locally is contextual. The guard rail is recognizing investigation-as-procrastination (looping instead of escalating) when it appears.

### §11.6 — Explicit file staging for public repos: never use `git add .`

Public GitHub repos with untracked sensitive files (investor business plans, pitch decks, legal drafts pre-lawyer-review, API keys, credentials) must use explicit file staging.

**Rule:** Never `git add .` or `git add -A`. Always stage explicit paths: `git add <path1> <path2> ...`. After staging, run `git status` and verify ONLY intended files are staged.

**Why:** git history is forensically recoverable. Untracked files accidentally staged become permanent public records. Sensitive content is especially high-risk on public repos.

**Pattern from Commit B:** Untracked investor business plan, pitch deck, legal drafts (pre-lawyer-review) existed in the working directory. Commit B appended operational documentation (RUNBOOK.md, launch-readiness-checklist.md). Staging used explicit `git add docs/RUNBOOK.md docs/launch-readiness-checklist.md`, followed by `git status` verification confirming ONLY these two files were staged. Sensitive files remained untracked and uncommitted.

**Verification sequence:**
```bash
git add docs/RUNBOOK.md docs/launch-readiness-checklist.md
git status    # verify only intended files shown as "Changes to be committed"
git commit -m "..."
```

### §11.7 — Pre-investigation reports stay non-destructive

Pre-investigation reports findings, flags, and recommendations — it does NOT edit files. File edits happen only after owner approval of the pre-investigation report and the proposed changes.

**Why:** Separation of concerns. Pre-investigation = discovery. Approval = gate. Edit = execution. The audit trail is clear: "we found X, proposed Y, got approval, then implemented Z." Each step is visible and reversible until approval. If the owner sees something unexpected in the pre-investigation findings, they can override the plan before code lands.

**Pattern:** Pre-investigation report (read files, query state, surface findings) → owner review and approval → agent executes edits per approved plan.

### §11.8 — Single-purpose commits over multi-purpose mega-commits

Split multi-concern work into focused commits. Each commit should have a single coherent purpose.

**Why:** Mega-commits are harder to review (conflation of concerns), harder to rollback (you revert three unrelated changes at once), harder to message (commit message needs multiple clauses separated by `+`).

**Sizing heuristic:** If your commit message needs multiple clauses (e.g., "governance migration + operational docs + doctrine extension"), split into separate commits. Each commit should land cleanly in 15–45 minutes of review time.

**Example from Stage 2.C:** Closure work split into three commits:
- **Commit A:** governance doctrines (D-125/D-126/D-127 + Implementation-Path Independence) migrated to canonical `DECISIONS.md`, pending file deleted, Gate 1 passed.
- **Commit B:** operational documentation (RUNBOOK.md extension + launch-readiness-checklist.md creation), explicit file staging, Gate 1 passed.
- **Commit C:** doctrine extension (MEMORY.md + agent-handoff.md Stage 2.C lessons), Gate 1 passed.

Each commit landed cleanly. Review time per commit: 15–30 minutes. Rollback granularity: one commit per concern. Message clarity: each message names exactly one change.
