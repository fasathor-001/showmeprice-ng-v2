# Journal — 2026-05-28 — Stage 1 admin tools, settings hub, profile lockdown, verification gate

**Continues:** `2026-05-28-sms-blocker-resolved-mocean.md` (same day, earlier session covered the Mocean SMS unblock + D-130–D-133 banking). **Commit range covered here:** `3019d7a` → `4abe364` — nineteen new commits across this session plus the two earlier docs commits referenced separately. The last three landed in the small hours of 2026-05-29, kept grouped here because they're the same continuous work-stream as the rest of 2026-05-28.

## Headline — first real seller live; trust infrastructure now exists

A real Nigerian seller passed the manual identity verification flow today and went live with listings visible in the marketplace — the first end-to-end demonstration that the system Phase E was built for actually works. By end of session the platform also has the operational trust infrastructure that has to exist for that promise to scale: working seller-WhatsApp OTP, verification sequencing that prevents broken seller states, per-listing admin moderation, a lean settings hub honest about what's locked, DB-enforced profile column lockdown, and a Stage 1 admin support tool that can actually fulfill the "contact support to change your phone / location" promises that settings page makes.

None of these were ornamental — each closed a real correctness gap. The settings hub without the freeze trigger would be UI theater; the freeze trigger without admin RPCs would trap users; the admin RPCs without an audit table would launder away accountability; the audit table without RLS-gated SELECT would leak admin actions to anyone curious. Each piece earns its commit.

## Shipped (in order)

| # | Commit | Subject |
|---|---|---|
| 1 | `3019d7a` | `fix(dashboard): correct profile label WhatsApp → Phone (D-055 column rename)` |
| 2 | `18a6702` | `feat(db): Stage A — seller WhatsApp verification schema + RPC (E.2.11.0, applied)` |
| 3 | `419cef2` | `feat(otp): Stage B — seller WhatsApp OTP actions + purpose lane separation` |
| 4 | `eba2497` | `feat(sell): Stage C — seller WhatsApp inline OTP UI + onboarding orchestration` |
| 5 | `1e8d217` | `feat(sell): WhatsApp-recovery banner closes the degraded-state dead-end` |
| 6 | `5b1efea` | `docs: bank D-134 (seller eligibility) D-135 (referral approach) D-136 (city required)` |
| 7 | `66a1dab` | `feat(admin): Stage 1 — admin reports triage queue` |
| 8 | `7dfecc0` | `feat(admin): Stage 2 — per-listing moderation (hide/un-hide) wired to reports (E.2.13.0)` |
| 9 | `524971b` | `docs: bank K-068 homepage category marquee (deferred to full launch)` |
| 10 | `9a2dc60` | `feat(home): mobile homepage shows first 3 categories only` |
| 11 | `6cef493` | `feat(sell): gate ID verification behind complete business details + verified WhatsApp (+ D-136 city-required fix)` |
| 12 | `853e7f8` | `fix(sell): clarify WhatsApp verification is by SMS + add recovery signpost` |
| 13 | `3d5ee88` | `feat(db): freeze protected profile columns + reveals default 3 (E.2.14.0)` |
| 14 | `b2b80dd` | `feat(notifications): email support@ when seller submits ID verification` |
| 15 | `53dc6fc` | `fix(home): refine hero sub-headline — clearer pain, in-app messaging fix` |
| 16 | `77ce57d` | `feat(settings): lean account hub on E.2.14.0 secured foundation` |
| 17 | `9ba107b` | `feat(db): profile_admin_changes audit table (E.2.15.0)` |
| 18 | `4493c22` | `feat(db): admin_change_user_phone + admin_change_user_location RPCs (E.2.16.0)` |
| 19 | `4abe364` | `feat(admin): user search + phone/location change UI (Stage 1 admin tools)` |

(Plus two earlier docs commits `28cd96a` + `ff39fe0` already covered in the prior journal.)

## Strategic significance

Yesterday this platform could deliver an OTP to a Nigerian phone. That was the launch gate. Today it has the trust loop end-to-end: a seller can sign up, verify their phone, verify the alternate WhatsApp they'll be reached on (or use their verified profile phone), complete their business details under a gate that won't let them publish in a half-formed state, submit ID verification, get an admin notification about the submission, get reviewed, and go live — with their listings now subject to per-listing moderation if a buyer reports them. The seller's account fields they shouldn't be able to mutate themselves (display name, phone, tier, etc.) are DB-locked, the settings page is honest about what's locked, and when a user needs an admin to change something they cannot self-change, the admin has a working tool that audits every action and emails the affected user. That's the load-bearing trust loop the rest of the marketplace's revenue thesis depends on.

The platform now has its first real verified seller and at least one live listing — proof of the loop in production. The work that followed (E.2.14.0 / E.2.15.0 / E.2.16.0 + the admin UI) makes the loop survive being asked to scale beyond Frank's first circle.

## Things caught and fixed

This is the honest section. The day's work also surfaced gotchas worth recording:

- **Settings page lockdown was UI theater before E.2.14.0.** The settings hub commit (`77ce57d`) had the right copy ("Set at signup; cannot be changed", "Contact support to change your phone number"), but until the freeze trigger landed in `3d5ee88`, those claims were enforceable only by the absence of an edit form — anyone with `rpc()` access could still mutate `display_name`/`phone`/`tier`. The freeze trigger makes the settings copy true at the DB layer, not just visually.
- **Supabase default-ACL gotcha bit us again, on a different vector.** E.2.1.1's `mark_phone_verified` lockdown taught the codebase that `REVOKE FROM PUBLIC` doesn't undo Supabase's auto-grants to `anon` + `authenticated`. E.2.16.0's RPCs needed `GRANT TO authenticated` (the app calls them from a session, not from service_role), so the threat surface flipped: the surplus grants we now have to revoke are `anon` + `service_role`. The migration file was wrong on the first draft — only `REVOKE FROM PUBLIC` — and the live ACL audit caught it. Migration file now carries the explicit `REVOKE EXECUTE FROM anon, service_role` so a fresh-DB replay locks down correctly. Pairs with the existing MEMORY lesson; new MEMORY lesson banked today to record this specific angle.
- **SQL Editor session-role + GUC subtleties bit three times in one day.** Two of them were minor verification-step surprises (E.2.14.0 §2 freeze-trigger probes; E.2.15.0 §2 INSERT-attempt controls returning 42501 before the CHECK ran), one was the ACL discovery above. Each surfaced under positive/negative control discipline — without the §2 paste-back, all three would have shipped. Banked as a new MEMORY lesson today.
- **D-136 follow-up tightening was due.** The original D-136 entry flagged `updateBusinessAction` as still permitting blank `city_area` updates. `6cef493` closed that follow-up in the same commit that built the verification sequencing gate, on the principle that the sequencing gate would be undermined if existing sellers could blank the field back out.

## Lessons banked (MEMORY.md, this session)

Two new entries appended:

1. **Supabase default function ACL bites SECURITY DEFINER admin functions** — caught live during E.2.16.0 verification. Builds on the existing E.2.1.1 lesson but covers the inverse case: admin functions `GRANT`'d to `authenticated`, where the surplus grants to revoke are `anon` + `service_role`. Migration files must carry the explicit revokes so fresh-DB replays don't degrade defense-in-depth.
2. **SQL Editor session-role and transaction-local GUC subtleties** — caught three times in this session (E.2.14.0 §2 freeze-trigger probes; E.2.15.0 §2 INSERT-attempt controls; E.2.16.0 §2b ACL discovery). Practical discipline: §0 / §1 / §2 as separate Editor executions, paste each result back individually, don't trust a single "looks right" — re-test in isolation when something surprises.

## Decisions banked (DECISIONS.md, this session)

Three new entries appended:

- **D-137** — Verification sequencing gate. Hard block: business details + WhatsApp verified BEFORE seller can submit ID verification. Three-layer enforcement (UI checklist on `/sell`, server redirect on `/sell/verify`, action guard in `submitVerificationAction`). Implementation: `6cef493`. Rationale: prevents sellers reaching published state with no city / no reachable contact.
- **D-138** — Profile column lockdown (E.2.14.0). DB-enforced lockdown on eight protected columns via `freeze_profile_protected_columns` trigger; bypass via transaction-local GUC `app.profile_system_write_authorized` mirrors E.2.2.0 pattern. Explicit list of locked vs. deliberately-NOT-locked columns recorded. Trust-thesis rationale.
- **D-139** — Stage 1 admin tools scope. What's built (search + detail + phone-change + location-change RPCs + user-notification email); what's deferred (account suspension, email change, deletion processing, consolidated audit coverage) and why each deferral. Rationale for the trim.

## Pending / deferred (queued for future sessions)

Lower-stakes documentation hygiene the agent and I trimmed from tonight's banking pass, because they don't cause harm by waiting one day:

- **D-140 (drafted, not yet banked)** — Settings page lockdown philosophy: "every claim on the settings page must be true at the DB layer." Not urgent; the philosophy is already de facto implemented via D-138.
- **D-141 (drafted, not yet banked)** — Admin email dispatcher fire-and-forget pattern (DB write is source of truth, email is the notification — never throws, always logs). De facto banked by `dispatchVerificationDecisionEmail` / `dispatchAdminProfileChangeNotification` precedents; documentation pass deferred.
- **New K-entries (not yet filed):**
  - **K-?? Audit coverage gap** — admin actions across `admin_action_log` / `admin_role_changes` / `profile_admin_changes` / `verification_status` updates are spread across multiple purpose-specific tables (D-081 unification deferred). Document the gap explicitly.
  - **K-?? Account suspension deferred** — Stage 2 of admin tools. Needs middleware login-gate + listing-visibility behavior beyond bare `is_disabled` flip.
  - **K-?? Avatar upload deferred** — settings hub ships initials-only; upload UI is a separate stage.
- **K-067 status check** — the prior journal flagged that the raw-SQL ALTER adding `'mocean'` to `phone_verifications_provider_check` needs a matching migration file. Status not re-verified today; needs a fresh-head pass to confirm whether that gap still exists or was closed in passing.
- **Email-change admin tool** — touches `auth.users` via Supabase admin SDK, not just `profiles`. Out of Stage 1 scope.
- **Deletion processing** — `RESTRICT` FK reality on `messages` / `conversations` / `orders` means soft-delete-PII-scrub design is required, not naive deletion. K-004 holds. Stage N work.

## Open questions / next-session entry point

- **D-140 / D-141 / K-entries above** — bank with a fresh head before the next feature work.
- **K-067** — verify status against current production; close or restate.
- **Stage 2 admin tools (account suspension)** — needs design pass before implementation. The middleware login-gate behavior + listing-visibility transitions on suspend/unsuspend are the design questions.
- **Avatar upload** — settings hub stub copy reads "Profile photo upload coming soon"; queued as the next user-facing settings increment.

## Disciplines that paid off

- **DB-first / surface-first review on every migration.** E.2.14.0, E.2.15.0, E.2.16.0 all ran §0 / §1 / §2 with paste-back; the ACL gap on E.2.16.0 only surfaced because of the §2b grant audit. Without that step every admin function would have shipped wide-open at the role-grant layer with only the in-function `is_admin` as a barrier.
- **Live-fire control tests inside ROLLBACK savepoints.** E.2.16.0's §2 ran twelve controls (positive + four negatives + idempotency for each RPC) — all green, zero residue. The RPCs went into production with the same confidence as if they'd been unit-tested.
- **Trim-the-scope-for-tired-review when banking docs.** Tonight's directive split the documentation pass into "must-bank tonight" (this commit) and "can-wait" items deferred to tomorrow. Tighter scope at late-night attention levels = better odds the docs are accurate.
