# Journal — 2026-05-22 (pm) — Stage 2.B database foundation

**Continues:** `2026-05-22-stage-2a1-admin-bootstrap.md` (same session). **Commit range:** `42d8057` (ESLint deploy fix) … (this commit).

## What this covered
Stage 2.B (messaging MVP) kickoff — Phase 1 verification + Phase 2 schema foundation. No application code yet; this was decisions + verified schema state, applying verify-actual-state throughout.

## Phase 1 — verification (no code)
- Read D-095–D-101 — these are **scope decisions, not DDL** (the table DDL lives in `PHASE_E_SPEC.md §7`).
- Production paste-back revealed `conversations` + `messages` are **fully built** (columns, CHECKs, FKs, indexes, 8 RLS policies) — far more than ACTUAL_SCHEMA documented ("zero policies, pending E.1.4"). The only genuine gap was Realtime publication membership (which then turned out to be already present too — see below).
- Broader RLS check: **44 tables RLS-enabled; 29 with policies; 15 RLS-only** (deferred-feature/service-role tables). The blanket "pending E.1.4" claim was stale.
- Also caught: `filter_rules.applies_to_context`/`applies_to_tier` were documented as `text[]` (correct) — a later Commit A edit briefly mis-recorded them as `jsonb` (inferred from CSV rendering), reverted in Commit B.

## Phase 2 — commits
- **Commit A (`b33d1c6`)** — banked **D-108** (template tracking via `messages.metadata.template_id`), **D-109** (`profiles.last_seen_at` only; response-time deferred to F+; asymmetric visibility), **D-110** (reuse §10 `filter_rules`, Interpretation C). Fixed ACTUAL_SCHEMA drift on conversations/messages (full detail), replaced the stale RLS blanket claim, count 43→44. Banked **K-028** (~19 tables' policy bodies un-transcribed).
- **Commit B (`07137b2`)** — migration **E.2.3.0**: `email`/`nuban` split per-context (block→listing_description, warn→message[free, Pro-exempt]); off-platform-handoff patterns stay hard-block in messages; listings unchanged. Reverted Commit A's wrong `jsonb` inference back to `text[]` (caught by E.2.3.0 §0 information_schema pre-flight). Banked **K-029** (NUBAN false-positives) + the "rendered output is never authoritative — only information_schema is" MEMORY lesson.
- **Commit C (this)** — **E.2.4.0 verified-already-applied** (no migration file shipped).

## Stage 2.B database foundation closed
All planned schema work for Stage 2.B is complete or already-present:
- E.2.3.0 filter_rules reconciliation: **shipped** (`07137b2`).
- E.2.4.0 realtime publication + `REPLICA IDENTITY FULL`: **verified already in place** (no migration file shipped; ACTUAL_SCHEMA updated to reflect verified state).
- Tables, constraints, indexes, RLS policies: all verified live in Phase 1.

**Mystery (K-030) — how did `conversations`/`messages` end up in `supabase_realtime` with `REPLICA IDENTITY FULL`?** Not our session tonight. Phase 1 query 10 AND E.2.4.0 §0a (run ~5 min before §1) both returned 0 rows for publication membership; §1's first `ALTER PUBLICATION ... ADD TABLE` then errored `42710` (already-member); the txn rolled back, and the post-rollback re-query showed both tables present **and** FULL. Since §1 aborted on its first statement, our `REPLICA IDENTITY FULL` ALTERs never ran — so that state pre-existed too. Possible explanations (none confirmed): Supabase Realtime auto-configuration; `pg_publication_tables` visibility/cache; out-of-band change. Non-blocking; tracked as K-030.

Database foundation now genuinely production-ready for Stage 2.B implementation. **Phase 3 begins next** — server actions + UI + Realtime subscriptions, scoped per-commit.

## Disciplines that paid off this session
- §0 `information_schema` pre-flight caught the `jsonb`-vs-`text[]` error before E.2.3.0 wrote a type-mismatched migration.
- Verify-actual-state (Phase 1) prevented drafting CREATE-TABLE/RLS migrations for already-deployed objects.
- The `42710` error + re-query reinforced: the operation itself — not a SELECT — is the ultimate proof of state (banked as the MEMORY addendum + K-030).

## Open questions / next-session entry point
- **Stage 2.B Phase 3 implementation.** Foundation locked. First slice TBD with the planner — likely: send-message + create-conversation server actions (with the §10 filter integration per D-110, including the K-029 price/negotiation whitelist), then the conversation/inbox UI + Realtime subscription. D-108 (`metadata.template_id`) and D-109 (`last_seen_at` — needs its profiles-column migration) wire in as their features land.
- **K-030** provenance investigation (low, future).

## Decisions made but not yet banked
- None outstanding.
