# Seller Acquisition Tracker

**Purpose:** Track progress toward Google Play Store submission prerequisites per D-150. Updated manually by Frank as sellers onboard and listings accumulate.

**Updated:** 2026-05-30

---

## Prerequisites (per D-150)

For Google Play Store submission to begin:

- [ ] **50+ active listings** (currently: TBD)
- [ ] **10+ verified sellers** (currently: TBD)
- [ ] **Platform stable in production for 2-3 weeks post-Feature-J** (Feature J shipped 2026-05-30; threshold met on or after 2026-06-13 for 2 weeks / 2026-06-20 for 3 weeks)
- [ ] **Lawyer-reviewed privacy policy** (pending lawyer reply on Brief/Cookie/RoPA)

For Apple App Store submission:

- All above prerequisites met
- Google Play live and stable for 4-6 weeks

---

## Current state

**Verified sellers:** TBD / 10

**Active listings:** TBD / 50

**Gap to Google Play readiness:** TBD sellers, TBD listings

---

## Verified seller registry

Public-visible data only: business name, city, category focus, listing count, verified date.

| Seller | City | Category focus | Listings | Verified date | Notes |
|---|---|---|---|---|---|
| Jervis_luxebrand | Warri, Delta | Fashion (jewelry, bags) | 8 | TBD | First verified seller |
| Reseller By OJemba | TBD | TBD | TBD | TBD | |
| Darace_Gadgets | Lagos | Gadgets | 0 | — | Verification pending |

---

## Pipeline (in-progress + pending)

Sellers who have started conversations, are being onboarded, or are in verification queue. Names anonymized when seller hasn't yet consented to being listed.

| Seller / Lead | Source | Stage | Next action | Last touch |
|---|---|---|---|---|
| Car vendor #1 | Direct outreach | Meeting scheduled (Monday) | Show platform demo | — |
| Car vendor #2 | Direct outreach | Meeting scheduled (Monday) | Show platform demo | — |

**Stages:**

- **Lead** — identified, not yet contacted
- **Contacted** — outreach initiated, no response
- **In conversation** — actively discussing
- **Demo scheduled / completed** — has seen the platform
- **Account created** — signed up, not yet verified
- **Verification submitted** — KYC documents in admin queue
- **Verified** — moves to Verified seller registry above

---

## Outreach channels

Where verified sellers are coming from:

- Direct founder outreach
- Word-of-mouth referral from existing sellers
- Specific marketplace categories targeted
- (others Frank fills in)

---

## Category coverage

Tracking diversity for Play Store listing screenshots — reviewers see varied supply.

| Category | Verified sellers | Active listings | Notes |
|---|---|---|---|
| Fashion & Apparel | 1 | 8 | Jervis_luxebrand carrying this |
| Vehicles | 0 | 0 | Car vendor meeting scheduled; Stage 1 ready to demo |
| Mobile Phones & Tablets | 0 | 0 | |
| Hair & Wigs | 0 | 0 | |
| Beauty & Personal Care | 0 | 0 | |
| Electronics & Gadgets | 0 | 0 | Darace_Gadgets in verification pipeline |
| Home & Furniture | 0 | 0 | |
| Power & Generators | 0 | 0 | |

---

## Weekly review cadence

Frank reviews this tracker weekly and updates:

- Verified seller count
- Active listing count
- Pipeline progress
- Outreach learnings (what's working, what's not)

When the prerequisites are met, this tracker pivots to feed the Google Play Store sprint (screenshots, store description writing, category copy, real-device testing, content rating questionnaire).

---

## Scope guard

This tracker is **Option A** — public-visible data only (business name, city, category, verification status, public listing count). It is safe to commit to the repo even though commits are durable.

**Operational notes** — private outreach assessments, contact phone numbers, internal status hunches ("this vendor seemed flaky") — should live in a separate non-git artifact (Notion, Google Doc, or a `.gitignore`d local file). Mixing operational hunches into git history is a leak risk if the repo ever changes visibility.

---

## Related documents

- [`DECISIONS.md`](../DECISIONS.md) — D-150 mobile distribution roadmap
- [`docs/launch-readiness-checklist.md`](./launch-readiness-checklist.md) — pre-launch verification items (Phase 1: Private Beta per D-128)
- [`ROADMAP.md`](../ROADMAP.md) — phase boundaries and current sprint
