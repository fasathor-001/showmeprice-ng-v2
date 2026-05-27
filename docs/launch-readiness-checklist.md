# Beta Launch Readiness Checklist

Pre-beta verification items. Phase 1: Private Beta per D-128.

## 1. Pre-launch infrastructure

- [ ] Supabase Pro Annual upgrade complete (see RUNBOOK.md database operations)
- [ ] Cloudflare Pages production env vars verified:
  - [ ] `RESEND_API_KEY` set (verified in Cloudflare dashboard)
  - [ ] `NEXT_PUBLIC_SUPABASE_URL` set
  - [ ] `SUPABASE_SERVICE_KEY` set
  - [ ] All `NEXT_PUBLIC_*` vars match local `.dev.vars`
- [ ] Database backups confirmed active (Supabase Pro tier feature, visible in dashboard)
- [ ] DNS configured correctly (custom domain `showmeprice.ng` resolves to Cloudflare)
- [ ] Pass 2 test account cleanup executed (see RUNBOOK.md: delete test accounts, listings, conversations, storage)
- [ ] Storage buckets cleaned (`message-images`, `product-images` contain only real data)

## 2. Pre-launch legal/operational

- [ ] Nigerian lawyer review of Terms v0.2 + Privacy v0.2 complete (sign-off received)
- [ ] Terms + Privacy published to production with last-updated dates
  - [ ] Published at `showmeprice.ng/terms` (if applicable)
  - [ ] Published at `showmeprice.ng/privacy` (if applicable)
  - [ ] Both visible in footer of production app
- [ ] Paystack developer team contact status documented (NOT a beta blocker per D-128)
- [ ] Manual credit grant procedure documented (fallback if Paystack delayed — future feature, tracked separately)

## 3. Pre-launch product verification

All Stage 2.C K-issues resolved or explicitly deferred. Cross-reference `KNOWN_ISSUES.md`:

- [ ] No critical bugs in production (scan K-issues for open critical items)
- [ ] Welcome email tested with real Nigerian phone number (verification code arrives in <5 min)
- [ ] All transactional emails verified live:
  - [ ] Verification code email (sent on signup)
  - [ ] Verification approved email (sent when admin approves phone verification)
  - [ ] Verification rejected email (sent when admin rejects)
  - [ ] Offline new message notification (sent when recipient has unread messages)
- [ ] Real-time messaging verified end-to-end:
  - [ ] Send text message, recipient receives immediately (no refresh needed)
  - [ ] Send image, placeholder shows at 288px width (no collapse; Commit 9-c.4 CSS fix: `w-72 max-w-full`)
  - [ ] Image loads after lazy-fetch completes (no hanging placeholders)
- [ ] Report Listing flow tested with all 5 categories:
  - [ ] Scam/Fraud
  - [ ] Misleading listing
  - [ ] Stolen item
  - [ ] Prohibited item
  - [ ] Other (with description)
- [ ] WhatsApp share button tested (click, copy link to clipboard, paste in chat)
- [ ] Copy link button tested (click, URL in clipboard, open in new tab)

## 4. Pre-launch test data state

- [ ] All test accounts deleted (preserve only ShowMePrice admin account)
- [ ] Test listings removed from `products` table
- [ ] Test conversations removed from `conversations` table
- [ ] Storage buckets cleaned:
  - [ ] `message-images/` contains no test images
  - [ ] `product-images/` contains no test images

Execute cleanup SQL in RUNBOOK.md section "Pass 2 test account cleanup" the morning of launch.

## 5. Pre-launch invitee preparation

- [ ] Beta invitee list finalized (small controlled invite-only cohort, 10-20 invitees per D-128 Phase 1)
  - [ ] Invitees identified (Nigerian marketplace participants, e.g., Instagram shop owners)
  - [ ] Contact info collected (email or WhatsApp)
- [ ] Invitation communication drafted and reviewed:
  - [ ] No public marketing language
  - [ ] Emphasizes private beta, observation-driven
  - [ ] Clear onboarding steps (sign up, verify phone, list first item)
  - [ ] Frank's contact for support during beta
- [ ] Onboarding instructions ready:
  - [ ] How to sign up (email/phone)
  - [ ] Phone verification process (SMS code, 5-min timeout)
  - [ ] How to become verified seller (upload ID, NIN, address)
  - [ ] How to list first item (category selection, image upload, price, description)
  - [ ] How to use in-app messaging (alternative to WhatsApp)
- [ ] Founder availability for first 48 hours confirmed (Frank available for manual support, questions, rapid fixes)

## 6. Day-of-launch sequence

Morning (before invitations sent):

- [ ] Final production smoke test:
  - [ ] Sign in with test account
  - [ ] Browse marketplace (categories load)
  - [ ] View a listing (images render)
  - [ ] Send a message (realtime delivery)
  - [ ] Submit a report (flow completes)
  - [ ] WhatsApp share and copy link both work
- [ ] Pass 2 cleanup executed (test accounts, listings, conversations deleted)
- [ ] Database backups confirmed active in Supabase dashboard

Mid-morning (invitations):

- [ ] Send invitations to beta cohort (private, individual or small group — NOT mass broadcast)
  - [ ] Each invitee receives personal invite (email or WhatsApp DM, not group chat)
  - [ ] Include sign-up link and onboarding instructions
  - [ ] Include Frank's contact for support

Active monitoring (first 24-48 hours):

- [ ] Monitor Supabase logs for errors
- [ ] Monitor Cloudflare metrics (error rate, cache hit rate)
- [ ] Monitor Resend delivery dashboard (email arrives)
- [ ] Check invitee sign-ups and first actions (manual spot-checks)
- [ ] Be ready for rapid hotfix if critical bug surfaces (rollback or targeted commit)

## 7. Beta observation criteria (reference D-128)

Track the 12 transition criteria from **D-128: Four-Phase Marketplace Lifecycle** to assess readiness for Phase 2 (Marketplace Learning).

Beta phase success requires ALL of the following to be true (binary, never partial):

**Transaction reality (Beta → Learning):**

- [ ] 10-20 completed real transactions observed during beta period
- [ ] ≥1 high-value transaction (>₦50,000) completed organically without operational intervention
  - Invitee listed item → different invitee browsed → purchase negotiated in-app → transaction completed

**Voluntary return behavior:**

- [ ] ≥30% of beta invitees return within 14 days unprompted (not nudged by email/SMS)
- [ ] ≥3 beta sellers list a second item after first item sold

**Moderation manageability:**

- [ ] <10 total reports during entire beta period
- [ ] All reports map to identifiable patterns (scam, misleading, stolen, prohibited, or legitimate edge cases)

**Trust mechanism validation:**

- [ ] Verified sellers receive measurably more messages than unverified (2x+ incoming message rate)
- [ ] In-app messaging used organically (not 100% of negotiations migrating to WhatsApp before listing)
- [ ] Welcome email recipients click through to Browse or "Become a seller" CTA

**Operational capacity:**

- [ ] No critical bugs OR rapid hotfixes applied without major rework
- [ ] Storage costs tracking as expected (no runaway image uploads)
- [ ] Database performance healthy at beta scale (<200ms query p99)

**KPI per D-128:** Trust recurrence — voluntary repeated trust behavior. NOT DAU, sessions, installs, signups, or social share count.

**Phase transition:** If all 12 criteria are true, beta closes and Phase 2 (Marketplace Learning) begins. If any criterion is false, beta continues OR specific gap is addressed with new experiments. No partial transitions.

## Anti-patterns during Phase 1 (per D-128)

Do NOT:

- [ ] Post about launch on social media (Twitter, Instagram, LinkedIn, etc.)
- [ ] Submit to Product Hunt or other discovery platforms
- [ ] Send mass WhatsApp broadcast to invitees (use individual DMs only)
- [ ] Publish press release or announcement blog post
- [ ] Open general public sign-up (invite-only only)
- [ ] Chase DAU/sessions/growth metrics (observe trust recurrence instead)
- [ ] Announce launch to investors, media, or partners (D-128 Phase 1 is internal observation)

These anti-patterns are explicitly incompatible with private beta observation (D-128 Phase 1).

## References

- **D-128: Four-Phase Marketplace Lifecycle** — phase-aware decision framework, transition criteria, KPI definition
- **KNOWN_ISSUES.md** — open K-issues, Stage 2.C resolution snapshot
- **RUNBOOK.md** — operational procedures (deploy, backup, incident response)
