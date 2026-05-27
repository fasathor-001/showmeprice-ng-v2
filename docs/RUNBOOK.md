# RUNBOOK.md

Operational procedures.

## Local development

```bash
pnpm install
cp .dev.vars.example .dev.vars   # fill in Supabase credentials when Phase A lands
pnpm dev
```

## Build gate (run before every commit)

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Local preview of production build

To verify a deploy will work before pushing:

```bash
pnpm cf:build      # produces .vercel/output/static
pnpm cf:preview    # serves it locally
```

## Deploying

Cloudflare Pages auto-deploys on push to `main` via the GitHub connection set up in the Cloudflare dashboard. To deploy:

```bash
git push origin main
```

That's it. Check the Cloudflare Pages dashboard for build status.

## Adding a new Supabase migration (after Phase A)

1. Edit Drizzle schema files in `src/db/schema/`
2. Run `pnpm db:generate` to generate SQL in `supabase/migrations/`
3. Review the SQL by eye
4. Apply locally with `pnpm db:migrate`
5. Commit schema + SQL
6. Apply to production via Supabase dashboard SQL editor. Production migrations are owner-initiated, never agent-initiated.

## Rolling back a bad commit

For code:

```bash
git revert <hash>
git push
```

Cloudflare Pages will redeploy automatically.

For DDL: no automatic rollback. Migrations are forward-only. Write a new migration that reverses the bad one.

## When `pnpm build` fails on Cloudflare Pages but passes locally

1. Verify Node version on Cloudflare matches local (Node 20)
2. Verify pnpm version on Cloudflare matches local (pnpm 9)
3. Check `.dev.vars` has env vars that aren't yet set in Cloudflare dashboard
4. Check for `export const runtime = "edge"` missing on a dynamic route
5. Check for `unstable_cache` or `revalidateTag` that snuck in

## When you see a stale page after a mutation

1. Verify the server action called `revalidatePath()`
2. Verify it was called for the right path
3. Check the `runtime` export on the page

## When auth breaks after a Supabase change

1. Check Supabase Auth → URL Configuration → redirect URLs include all deploy URLs
2. Check the `@supabase/ssr` middleware is wired correctly

## Generating the payment-details encryption key (D-120)

`PAYMENT_DETAILS_ENCRYPTION_KEY` must be a Base64-encoded 32-byte value (AES-256). It encrypts seller bank-account numbers at rest via Web Crypto in `src/lib/crypto/payment-details.ts`.

Generate one (do this once per environment — local dev / staging / production):

```bash
openssl rand -base64 32
```

Where to put it:

- **Local dev:** add to `.dev.vars` (gitignored). The value never leaves the dev machine.
- **Production:** add to Cloudflare Pages → Project → Settings → Environment variables → Production. Mark as encrypted secret.
- **Staging:** same as production but in the Preview environment scope.

**Rotation:** rotating the key invalidates all stored ciphertext (existing rows become un-decryptable). At MVP scale this is acceptable — schedule rotation only with a planned re-share flow that re-encrypts under the new key. Track as a future K-issue if compromise is suspected.

## Database operations

### Connecting to Supabase

Supabase connection details are stored in environment variables:

- **Local dev:** `.dev.vars` (gitignored)
- **Production:** Cloudflare Pages → Project → Settings → Environment variables

Required variables:
- `NEXT_PUBLIC_SUPABASE_URL` — public, safe to expose
- `SUPABASE_SERVICE_KEY` — secret, server-side only
- `SUPABASE_ANON_KEY` — public, client-side

All credentials live in the Supabase project dashboard under Settings → API. Never commit these values.

### Running migrations

Migrations are Drizzle-generated SQL in `supabase/migrations/`. To apply locally:

```bash
pnpm db:migrate
```

This runs all unapplied migrations against your local Supabase project (via `.dev.vars` credentials).

**Production migrations:** owner-initiated only via Supabase dashboard. Never automate production DDL. Each migration:

1. Generate in `supabase/migrations/` via `pnpm db:generate` (after schema edits in `src/db/schema/`)
2. Review SQL by eye — confirm no unwanted renames, drops, or structural changes
3. Test locally with `pnpm db:migrate`
4. Commit with schema changes
5. Apply to production via Supabase dashboard SQL editor (owner navigates dashboard, copies SQL, executes)

### §0 pre-flight verification pattern

Before locking architectural decisions on a schema change, run:

```bash
pnpm db:migrate        # apply locally
pnpm typecheck         # verify schema types resolve
pnpm build             # verify no runtime SQL failures
```

If any step fails, investigate before committing. This pattern established in Stage 2.C migrations (Commit 10-c, Commit 12) prevents silent schema drift.

### Backup approach

**Free tier:** Supabase performs automatic daily backups, deleted after 7 days.  
**Pro Annual tier:** longer retention, downloadable backups.

At beta launch (Phase 1 of D-128), upgrade to **Supabase Pro Annual**. This enables:
- longer backup retention
- automated backups at higher frequency
- downloadable backup archives

Procedure:
1. Navigate Supabase dashboard → Organization → Billing
2. Upgrade to Pro Annual (see `docs/launch-readiness-checklist.md` for pre-launch verification)
3. Confirm in Supabase dashboard that backups are active

### Free tier limits

Supabase Free tier includes:
- Up to 500 MB database size
- 2 GB file storage (images, documents)
- 5 concurrent connections

At MVP scale these are sufficient. If approaching limits:
- Monitor database size via Supabase dashboard → Database → Billing
- Monitor storage size via Supabase dashboard → Storage
- Upgrade to Pro Annual before limit-hit (no downtime, immediate effect)

## Common operations

### Adding a new email template

Email templates live in Resend:

1. Log in to Resend dashboard (resend.com) with ShowMePrice organization credentials
2. Templates → Create Template
3. Use React JSX syntax; Resend compiles to HTML
4. Template variables (e.g., `{firstName}`, `{verificationUrl}`) — wrap in `{curly braces}`
5. Once created, note the template ID (e.g., `d-abc123def`)
6. In `src/lib/email/`, create a new function that calls `resend.emails.send()`:

```typescript
import { resend } from "@/lib/email/client";

export async function sendCustomEmail(email: string, data: Record<string, string>) {
  return resend.emails.send({
    from: "ShowMePrice <noreply@showmeprice.ng>",
    to: email,
    template: "d-template-id-here",
    react: { /* template vars */ },
  });
}
```

7. Dispatch via server action in `src/app/api/` or page.tsx server function
8. Test locally with a dev Resend key (in `.dev.vars`)
9. Commit function; test in production after deploy

**Resend Best Effort:** dispatch is fire-and-forget. If delivery fails transsiently, Resend retries 3 times over 24 hours. No application-level retry loop needed.

### Adding a new K-issue

K-issues are known issues, tracked in `KNOWN_ISSUES.md`:

1. Open `KNOWN_ISSUES.md`
2. Find the next available K-NNN number (currently K-001 through K-060+)
3. Append new entry:

```markdown
## K-NNN: Short title

**Context:** Brief description of the issue.

**Impact:** Who is affected, when does it surface.

**Current workaround:** If applicable.

**Resolution:** Expected fix, deferral justification, or "Tracked but no immediate action."

**Introduced:** commit hash where it first appeared (if known)
```

4. Commit with message `docs(known-issues): add K-NNN — <title>`
5. Never edit prior K-issue entries; supersede with a new K-NNN if circumstances change

### Adding a new D-decision

D-decisions are architectural decisions, tracked in `DECISIONS.md`. It is append-only, never edit prior entries. Reference D-128 for phase-aware decision-making.

1. Open `DECISIONS.md`
2. Find the next available D-NNN number (currently D-001 through D-128)
3. Append new entry at the end:

```markdown
## D-NNN: Title of decision

**Context:** Why this decision is relevant now.

**Decision:** What was chosen.

**Why:** Justification, trade-offs, phase applicability per D-128.

**Cross-references:** Link to related D-decisions or K-issues.
```

4. Commit with message `docs(decisions): bank D-NNN — <title>`
5. When a prior decision's context shifts, do NOT edit the prior entry. Instead, write a new D-NNN that explicitly supersedes and explains why.

### Verifying user account state

Common queries to check user status without leaving the SQL editor:

```sql
-- Find user by phone (exact match)
SELECT id, email, created_at, verification_status
FROM profiles
WHERE phone = '+2348012345678'
LIMIT 1;

-- Find user by email (exact match)
SELECT id, phone, created_at, verification_status
FROM profiles
WHERE email = 'user@example.com'
LIMIT 1;

-- Count verified sellers
SELECT COUNT(*) as verified_seller_count
FROM businesses
WHERE verification_status = 'verified';

-- Recent unverified business signup
SELECT id, owner_id, business_name, created_at, verification_status
FROM businesses
WHERE verification_status != 'verified'
ORDER BY created_at DESC
LIMIT 5;
```

Run in Supabase dashboard → SQL Editor. Results are read-only; no changes persist.

## Incident response

### Cloudflare Pages deploy failure

When a commit pushes but the Cloudflare build fails:

1. Check Cloudflare Pages dashboard → Deployments → click the failed deployment
2. View Build log — look for:
   - `pnpm install` failures (missing dependencies)
   - `pnpm build` failures (type errors, edge runtime incompatibilities)
   - Missing environment variables (check Settings → Environment variables)
3. Fix locally:
   - If build error: fix code locally, commit, push
   - If missing env var: add to Cloudflare dashboard, re-trigger deployment via Cloudflare UI (Deployments → Redeploy)
4. Verify in Cloudflare UI that the new deployment is green

### Supabase outage

Check https://status.supabase.com for real-time status. If authentication or database is down:

1. Confirm on status page (not local network issue)
2. For beta cohort: no public status page — manual outreach (Slack, email, WhatsApp to invitees if available)
3. During outage, app will show authentication errors or database timeout errors
4. No application-level failover; await Supabase recovery
5. Once Supabase status returns green, test sign-in flow and basic operations

### Resend email delivery failure

If emails are not arriving:

1. Check Resend dashboard → Logs → filter by email address
2. View the delivery status (Bounced, Rejected, Complaint, etc.)
3. If Bounced/Rejected: email address is invalid or blocked by recipient ISP
4. If Complaint: recipient marked as spam; Resend will suppress future sends to this address
5. Best Effort pattern: Resend retries 3 times over 24 hours automatically; no manual retry needed
6. For critical flows (welcome, verification code): fallback is SMS or manual re-send via admin interface (future feature)

### Production bug surface

When a bug is discovered in production (live on main, deployed to Cloudflare):

**Rollback path (preferred for data-loss or critical auth bugs):**
```bash
git revert <hash>
git push origin main
```
Cloudflare Pages redeploys automatically.

**Hotfix path (for UI/UX/non-critical bugs):**
1. Fix code locally
2. Commit: `git commit -m "fix: <description>"`
3. Push: `git push origin main`
4. Verify in Cloudflare that new build is green

Both paths require Gate 1 to pass locally before push (typecheck/lint/build).

## Beta launch operations

### Phase-aware decision framework

Reference **D-128: Four-Phase Marketplace Lifecycle** for decision-making during beta. Key principle: **The active phase determines what work is appropriate.**

Beta is Phase 1: Private Beta. Per D-128:
- Small, controlled invite-only cohort (10-20 invitees)
- Focus on observation: do invitees use in-app messaging? Do they list second items? Do they invite friends?
- NOT focused on feature parity, growth, or optimization
- **Anti-patterns:** no public announcement, no social media, no Product Hunt, no mass WhatsApp broadcast

### Beta invitee management

Beta invitees are added manually, one-by-one:

1. Invitee identifies themselves or Frank identifies candidates (Nigerian marketplace participants, e.g., existing Instagram shop owners)
2. Frank creates test business account in Supabase (via SQL or admin UI)
3. Invitee receives private invite message (email or WhatsApp, not public link)
4. Invitee signs up, verifies phone, lists first item
5. Monitor usage over 2-4 weeks per D-128 transition criteria (see `docs/launch-readiness-checklist.md` section 7)

No public sign-up CTA during Phase 1. Phase 2 (Marketplace Learning) opens signup when Phase 1 transition criteria are met.

### Pass 2 test account cleanup

Before beta launch day:

```bash
# (Manual steps — no automation script yet)
# 1. In Supabase, delete all test accounts created during development
DELETE FROM profiles WHERE email LIKE '%test%' OR phone LIKE '+23480TEST%';

# 2. Delete test listings
DELETE FROM products WHERE title LIKE '%test%' OR created_by IN (SELECT id FROM profiles WHERE email LIKE '%test%');

# 3. Delete test conversations
DELETE FROM conversations WHERE listing_id IN (SELECT id FROM products WHERE title LIKE '%test%');

# 4. Verify storage buckets are clean
# In Supabase dashboard → Storage, manually delete test image folders if any
```

Execute these steps on beta launch day (day-of, after final smoke test passes).

### Supabase Pro Annual upgrade

Timing: at beta launch.

Procedure (owner-initiated):
1. Supabase dashboard → Organization → Billing → Plan
2. Upgrade to Pro Annual
3. Confirm in dashboard that backups are now active (longer retention)
4. No downtime; takes effect immediately

Cost: ~$25/month (see Supabase pricing for current rates).

### Monitoring approach (first 48 hours)

During the first 48 hours of beta:

**Supabase logs:**
- Dashboard → SQL Editor → run sample queries to spot errors or unusual patterns
- Check database size growth (Storage tab)
- Monitor query performance (no obvious slowdowns)

**Cloudflare metrics:**
- Deployments dashboard: verify no new deploy failures
- Cache hit rate: ideally >80% (indicates pages are caching well)
- Error rate: watch for 4xx/5xx spikes

**Resend delivery:**
- Resend dashboard → Logs: verify all transactional emails arrive (verify code, welcome, offline message notifications)

**Manual checks:**
- Sign in as test invitee, browse listings
- Send a message and verify realtime delivery
- Check uploaded images render without delay
- Verify report flow (tap Report, submit form)

If any metric spikes or error appears, consider rollback (git revert) or targeted hotfix. Decisions made by Frank in real-time.

### Anti-patterns during Phase 1 (per D-128)

Do NOT:
- Post about launch on Twitter, Instagram, or other social media
- Submit to Product Hunt
- Send mass WhatsApp broadcast to invitees (use individual DMs or email instead)
- Publish public press release or blog post
- Open general sign-up (invite-only only)
- Chase DAU/sessions/growth metrics (focus on trust recurrence instead)

These anti-patterns are explicitly called out in D-128 Phase 1 as incompatible with observation-driven private beta.
