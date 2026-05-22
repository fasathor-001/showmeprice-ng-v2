# Journal — 2026-05-22 — Stage 2.A.1 admin role provisioning (D-105)

**Commit range:** `4460e88` … (this docs commit) · **Session:** 2026-05-22 (continuation from the 2026-05-21 Stage 2.A close)

## Session start state
- Continued from the 2026-05-21 close (`docs/journal/2026-05-21-stage-2a-close-and-agent-handoff.md`). Stage 2.A complete; K-020 (admin bootstrap undecided) and K-019 (NG-only phone policy) open.
- **First real test of the agent-handoff §7 opening protocol with a fresh agent.** A Claude app freeze had interrupted the prior session mid-work; this session re-grounded from scratch via the §3 read-order + §7 grounding summary. The protocol worked: the grounding summary caught real drift (stale journal vs HEAD, K-020 still Open after D-105 banked, K-019↔D-105 collision) before any code was written.
- The E.2.2.0 migration had already been **executed + verified in production** during the pre-freeze session (all §0/§1/§2a–§2h paste-backs green, including the §2f triple-REVOKE grantee audit and the §2h 12-scenario behavioral test under ROLLBACK). So this session was DB-after-the-fact: code Commits 3–5 landed against already-deployed state; Commit 6 reconciled the docs.

## Decisions locked + banked
- **D-105 — Admin role provisioning (Stage 2.A.1 scope).** Three sub-decisions: (1) WHEN — built as Stage 2.A.1, between 2.A close and 2.B start; (2) HOW first admin — `ADMIN_BOOTSTRAP_EMAIL` env var, auto-grant on signup/signin match (`admin@showmeprice.ng`); (3) HOW subsequent — `/admin/users` UI calling SECURITY DEFINER grant/revoke, audited, with self-revoke + last-admin protection.
- Bootstrap email is `admin@showmeprice.ng` — deliberately separate from Frank's personal `fasathor@gmail.com` (which becomes admin via the UI grant after Commit 5, not via env var).

## Migration architecture (E.2.2.0)
- **GUC-guarded `freeze_profile_role` bypass** — the key architectural move, **surfaced during agent investigation, NOT in D-105's original implications.** The `profiles_freeze_role` trigger checks `auth.uid()` against an admin row, but service_role has `auth.uid() = NULL`, so a service_role-executed SECURITY DEFINER function could not change `profiles.role`. Fix: gate the trigger's bypass on a transaction-local GUC (`app.role_change_authorized`), set ONLY inside `grant_admin_role`/`revoke_admin_role` immediately before their protected UPDATE. LOCAL scope dies at txn end; `set_config` lives in `pg_catalog` (not exposed via PostgREST), so no other caller can set it. Banked as a MEMORY principle ("GUC-guarded trigger bypass for SECURITY DEFINER admin operations") in the same commit.
- `admin_role_changes` append-only audit table (admin-only SELECT RLS; no write policy — writes only via the functions or service_role).
- `grant_admin_role` / `revoke_admin_role` — SECURITY DEFINER, `search_path=public`, triple-REVOKE'd (anon + authenticated + PUBLIC) then GRANT service_role, per the E.2.1.1 lockdown principle. Idempotent (already-admin grant / non-admin revoke → `false`, no audit row). Self-revoke + last-admin guards inside the SQL.

## Commits
- `4460e88` — D-105 banked (docs)
- `80e4913` — E.2.2.0 migration + MEMORY principle (GUC-guarded trigger bypass)
- `73a37ce` — bootstrap detection (`src/lib/auth/admin-bootstrap.ts` `maybeBootstrapAdmin`, wired into `/auth/callback` + `signInAction`; `admin_role_changes` Drizzle mirror; `ADMIN_BOOTSTRAP_EMAIL` in `.dev.vars` + example)
- `fa0929f` — shared `requireAdmin` (`src/lib/auth/require-admin.ts`) + `grantAdminAction`/`revokeAdminAction` (`src/app/admin/users/actions.ts`)
- `ff83c69` — `/admin/users` UI (`page.tsx` + `UserAdminControls.tsx`)
- (this commit) — docs sweep: K-020 → Resolved, K-021 + K-022 banked, §2c migration fix, ACTUAL_SCHEMA + PHASE_E_SPEC updated, this journal

## Browser smoke test results (production, 2026-05-22)
- Bootstrap fired on email confirmation → `admin@showmeprice.ng` granted admin (`granter_id` NULL, `action='bootstrap'`, reason `'ADMIN_BOOTSTRAP_EMAIL match on signin/signup'`).
- `/admin/users` loaded; 6 users displayed (3 original admins + 3 non-admins).
- Self-revoke disabling worked with helper text "Cannot revoke your own admin role".
- Two revokes executed: `fasathor+smp@gmail.com` and `fasathor+buyer@gmail.com`, both with `granter_id` = `admin@showmeprice.ng`, reasons captured in `admin_role_changes`.
- Atomic role updates + audit rows landed; `router.refresh()` reflected the change. End state: **1 active admin** (`admin@showmeprice.ng`), 5 non-admins, 3 audit entries.
- **Pre-existing test admins cleanup validates the revoke path end-to-end** — the two test admins were originally provisioned via the SQL trigger workaround; revoking them through the new UI proves the product feature replaces the workaround.

## Carried-forward notes
- **`requireAdmin` "described-as-established-but-actually-inline":** D-105 called `requireAdmin()` the "established Phase C.5.6 pattern," but at session start the guard was inline in `/admin/verifications/page.tsx` + a private helper in `(auth)/actions.ts` — no shared exported helper, no `/admin/layout.tsx`. Extracted to `src/lib/auth/require-admin.ts` in Commit 4 as a **deep-import-only** helper (NOT barrel-exported: it imports the server-only Supabase client → `next/headers`, and the barrel is imported by the `VerifyPhoneForm` client component, so a barrel re-export would break the client build). Existing inline call sites intentionally left unmigrated — consolidation deferred to a future cleanup commit.
- **`maybeBootstrapAdmin` in the `@/lib/auth` barrel** lands the admin-client module in client bundles as dead code (no `next/headers`, so it doesn't break the build; service key read at call-time, never invoked client-side, so no leak). Hygiene candidate — deferred (e.g. a `server-only` auth submodule that holds both `requireAdmin` and `maybeBootstrapAdmin`).
- **`.dev.vars.example` broader drift:** 7 keys vs `.dev.vars`'s 14 (missing all OTP/Arkesel keys). Reconciliation deferred; only `ADMIN_BOOTSTRAP_EMAIL` was added this round.
- **`/admin/users` Card list adequate for v2 scale** (limit 200, no pagination); reconsider a table layout if user count exceeds ~50.
- **Self-revoke message takes precedence over last-admin message** when both conditions hold — matches the SQL guard order (self-revoke check raises first).
- **K-021** (`freeze_profile_role` missing `SET search_path=public`) and **K-022** (§2c `polname`→`policyname`, fixed in-place this commit) banked.

## Production reminder
- **`ADMIN_BOOTSTRAP_EMAIL` must be set in Cloudflare Pages environment variables before the next production deploy.** Local dev validated; production env var not yet set.

## Open questions / next-session entry point
- **Stage 2.B — messaging MVP** (scope locked D-095–D-101): text + images + safety layer (D-101) + first-message templates (D-096) + basic offers (D-099) + presence signals (D-100). Spec callout at `PHASE_E_SPEC.md` §7. Next inflection point — start with schema (conversations + messages) using the §0/§1/§2 migration discipline.
- **K-019** (NG-only vs international phone policy) still un-banked — a future D-106 (or higher) product decision. The founder being a Nigerian based in SA is the live tension. Out of scope for Stage 2.A.1.

## Decisions made but not yet banked
- None outstanding.

## Discovered scope (banked for next session)

During Stage 2.A.1 end-to-end smoke test, two UX gaps surfaced that were not in D-105's original scope:

**K-024 (medium) — Admin navigation entry point missing.** Admins must type /admin/users or /admin/verifications directly. Frank flagged this immediately after the cleanup smoke test succeeded: "admin account is suppose to have admin button for admin to access admin page not visiting the link directly". Banked as D-106 (Stage 2.A.2) — single Admin link in header + /admin landing page + minimal visual treatment. Blocks Stage 2.B kickoff per D-106 §1.

**K-023 (medium-low) — Expired/consumed confirmation link UX.** Re-clicking an already-used Supabase confirmation link redirects to /sign-in with no contextual messaging. Affects all users (not admin-specific). Banked Open for a future session; not blocking Stage 2.A.2 or 2.B.

Both gaps discovered through browser smoke test that pure code review would have missed. Notable pattern: smoke testing real user flows surfaces UX gaps that typecheck and structural verification cannot.

## Next session entry point

Stage 2.A.2 implementation (D-106) — admin navigation. Single coherent commit: header modification + /admin landing page + inline guard. ~30-60 min of agent work.

After Stage 2.A.2 closes, Stage 2.B (messaging MVP, D-095-D-101) is the next inflection point.

## Additional discovered scope (post-K-024 banking)

After D-106 + K-024 banking (commit 2ac23e3), a second architectural concern emerged from continued Stage 2.A.1 review:

**K-025 — Grant buttons don't scale.** Frank flagged that the /admin/users page lists ALL users with grant/revoke buttons, and at production scale (1000+ users) this becomes overwhelming. The architectural insight: MVP doesn't actually need a general user directory feature — admin operations are scoped (verifications + admin role management), and casual user browsing has no use case yet.

Banked as D-107 (Stage 2.A.3): rename /admin/users to /admin/staff, scope to admin users only, replace row-level grant buttons with a search-and-grant dialog at the top of the page. Search-first pattern handles "find a user to promote" without listing everyone.

Naming choice: /admin/staff over /admin/admins because it accommodates future non-admin staff roles (moderator, content-admin) without another rename.

Stage 2.A scope ordering: D-106 (Stage 2.A.2 — header + landing) ships first, then D-107 (Stage 2.A.3 — staff page refactor). Both before Stage 2.B (messaging MVP).

Pattern note: smoke testing surfaces UX/scope gaps that code review and structural verification miss. Stage 2.A.1 shipped technically correct code that nonetheless had the wrong shape for production scale. The discipline of "look at the thing you built and ask if it actually works" caught it.

## Stage 2.A formally complete

Stage 2.A.3 (D-107) shipped in commit f412dab. Renamed /admin/users → /admin/staff, scoped to admin users only, search-and-grant flow operational. End-to-end smoke test passed on production: search excludes existing admins and disabled users, grant flow promotes with audit trail, panel auto-collapses on success.

Two discovered gaps during smoke test banked as K-026 (back-navigation link from /admin sub-pages — low UX polish) and K-027 (DB-layer is_disabled hardening in grant_admin_role — defense-in-depth, parallel to K-021).

Stage 2.A scope ordering achieved:
- 2.A.1 (D-105) admin provisioning ✓
- ESLint config fix (unblocks Cloudflare deploys) ✓
- 2.A.2 (D-106) admin nav ✓
- 2.A.3 (D-107) staff refactor ✓

Next inflection point: Stage 2.B (messaging MVP, scope locked D-095-D-101). Database migration for conversations + messages tables, then UI implementation.

Pattern observation: this session was a stress test of the agent-handoff protocol. Survived a Claude app freeze (mid-session agent restart via §7 protocol), surfaced and fixed a 2-day production deploy backlog caused by an ESLint config gap, and shipped 16 commits across three commit chains while maintaining documentation discipline. The "verify-actual-state" discipline caught critical issues (production deploy backlog, freeze_profile_role GUC bypass requirement) that would have shipped silently otherwise.

Banked principle: smoke testing on production (not just localhost) is the final gate. Frank's persistent questioning ("the verify button is missing on production") caught the deploy backlog. Dismissive responses ("you're not logged in") delayed diagnosis. Founder instincts about UX gaps are signal, not friction.
