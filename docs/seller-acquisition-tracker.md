# Seller Acquisition Tracker

**Purpose:** Track progress toward Google Play Store submission prerequisites per D-150. Updated manually by Frank as sellers onboard and listings accumulate.

**Updated:** 2026-05-31

---

## Recent activity (2026-05-31)

- **Verified seller added:** kay_interiors_hub (Asathor Oghenekaro) — Warri, Delta — Furniture & Home Goods
- **Car vendor confirmed for tomorrow:** First vehicle category seller onboarding scheduled 2026-06-01 afternoon
- **P0 signup incident resolved:** Phone collision with dormant test account blocked Kay's signup; root cause identified, dormant account cleaned up, signup flow verified working
- **Test data cleanup completed:** 8 personal test accounts removed from production database (Franklin Ojo, Fasa, Friday Onome, Jane Umukoro, Johnbull Okeke, Mark Atamu, Empire Empress, Frank Seller)

---

## Prerequisites (per D-150)

For Google Play Store submission to begin:

- [ ] **50+ active listings** (currently: 8)
- [ ] **10+ verified sellers** (currently: 3)
- [ ] **Platform stable in production for 2-3 weeks post-Feature-J** (Feature J shipped 2026-05-30; threshold met on or after 2026-06-13 for 2 weeks / 2026-06-20 for 3 weeks)
- [ ] **Lawyer-reviewed privacy policy** (pending lawyer reply on Brief/Cookie/RoPA)

For Apple App Store submission:

- All above prerequisites met
- Google Play live and stable for 4-6 weeks

---

## Current state

**Verified sellers:** 3 / 10

**Active listings:** 8 / 50

**Gap to Google Play readiness:** 7 sellers, 42 listings remaining to reach Google Play prerequisites

---

## Verified seller registry

Public-visible data only: business name, city, state, category focus, listing count, verified date.

| Seller | City | State | Category focus | Listings | Verified date | Notes |
|---|---|---|---|---|---|---|
| Jervis_luxebrand | Warri | Delta | Fashion (jewelry, bags) | 8 | 2026-05-28 | First verified seller |
| Reseller By OJemba | TBD | TBD | TBD | TBD | TBD | Reseller — multi-category |
| kay_interiors_hub | Warri | Delta | Furniture & Home Goods | 0 | 2026-05-31 | High-end interior design seller; verified this morning |

---

## Pipeline (in-progress + pending)

Sellers who have started conversations, are being onboarded, or are in verification queue. Names anonymized when seller hasn't yet consented to being listed.

| Seller / Lead | Source | Stage | Next action | Last touch |
|---|---|---|---|---|
| Car Vendor 1 | Direct outreach (Frank personal contact) | Onboarding confirmed for 2026-06-01 | Walk through signup + verification flow tomorrow | 2026-05-31 (morning follow-up call) |
| Car Vendor 2 | Direct outreach (Frank personal contact) | In conversation — meeting 2026-06-01 PM | Show demo, gauge commitment | 2026-05-30 |
| Darace_Gadgets | Self-initiated signup | Account created — verification pending submission | Frank follow-up on document submission | TBD |

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
| Fashion & Apparel | 1 | 8 | Jervis_luxebrand |
| Furniture & Home Goods | 1 | 0 | kay_interiors_hub — new as of 2026-05-31, listings incoming |
| Vehicles | 0 | 0 | Car vendor #1 onboarding 2026-06-01; car vendor #2 meeting same day |
| Electronics & Gadgets | 0 | 0 | Darace_Gadgets in verification pipeline |
| Mobile Phones & Tablets | 0 | 0 | |
| Hair & Wigs | 0 | 0 | |
| Beauty & Personal Care | 0 | 0 | |
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
