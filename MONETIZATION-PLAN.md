# MONETIZATION-PLAN.md — ShowMePrice.ng

**Document version:** v2.0
**Status:** Locked for Phase E launch
**Last revised:** Sprint 1 banking session (D-082 through D-092)
**Supersedes:** v1.0 monetization framing in `PHASE_E_SPEC.md` §11 and earlier; the investor materials at `docs/investor/` reconciled to this plan in Sprint 1.6

> **This is the canonical reference for all monetization-related implementation, copy, pricing display, and operational decisions.** If any other file in the repository — including `PHASE_E_SPEC.md`, `ACTUAL_SCHEMA.md`, or investor materials — conflicts with this document, **this document wins** and the conflicting file must be reconciled.
>
> The corresponding banked decisions in `DECISIONS.md` are the authoritative source for *rationale*; this document is the authoritative source for *what is shipping*.

---

## Contents

1. [Strategic Positioning](#1-strategic-positioning)
2. [Banked Principles Reference](#2-banked-principles-reference)
3. [Buyer Tiers](#3-buyer-tiers)
4. [Credit Packs](#4-credit-packs)
5. [Escrow](#5-escrow)
6. [Seller Monetization](#6-seller-monetization)
7. [Founding Seller Offer](#7-founding-seller-offer)
8. [Listing Boosts & Promoted Placement](#8-listing-boosts--promoted-placement)
9. [Payment Infrastructure](#9-payment-infrastructure)
10. [Tier Comparison Tables](#10-tier-comparison-tables)
11. [Operational Rules](#11-operational-rules)
12. [Validation Disclosure](#12-validation-disclosure)
13. [Revision History](#13-revision-history)

---

## 1. Strategic Positioning

**ShowMePrice's Year 1 strategic path is trust velocity over revenue extraction** ("Path B" in our planning shorthand). The platform optimizes for accumulating verified sellers, serious buyers, and a clean dispute trail — not for maximum subscription revenue extraction in the first 12 months.

This drives three structural decisions:

- **Seller monetization is deferred to Phase F** (D-091). Sellers won't pay until they see buyer demand. Year 1 seller experience is genuinely free and fully featured for the foundation use case.
- **Escrow is buyer-gated, not seller-gated** (D-082). A Free Seller can receive escrow-protected orders. The buyer chooses protection; the seller's payment plan is irrelevant to that choice.
- **The Pro Buyer tier consolidates speed + protection** (D-082). The earlier "Pro for speed, Premium for protection" two-tier framing is eliminated. Single subscription tier with full features at a single price point.

Trust velocity is a measurable concept. The Year 1 success metrics ShowMePrice optimizes for are:

| Metric | Year 1 target |
|---|---|
| Verified Lagos sellers across the 5 launch categories | 100+ |
| Phone-verified buyers | 15,000+ |
| Reply rate (rolling 30-day, all sellers) | >60% within 24h on first message |
| Dispute resolution SLA (median) | <48 hours |
| Escrow transactions completed cleanly | 100+ /month by year-end |

Subscription revenue is secondary to these metrics in Year 1. Phase F (months 12–18 post-launch) introduces seller monetization once the buyer demand signal is undeniable.

---

## 2. Banked Principles Reference

All monetization design respects six non-negotiable architecture rules, banked in full in `MEMORY.md`:

| # | Principle | Source |
|---|---|---|
| 1 | Escrow is buyer-gated, never seller-gated | D-082, D-091 |
| 2 | Verification is earned, not bought | D-088 framing |
| 3 | Free Sellers must always receive buyer messages | D-091 |
| 4 | Paid promotion never overrides trust quality | D-091, MONETIZATION-PLAN.md §8 |
| 5 | Prices must always be visible | (platform-name commitment) |
| 6 | Trust & safety operates equally regardless of tier | D-089 |

Any monetization proposal that violates one of these is wrong, not the principle. The principles are not negotiable — they predate revision under any "but we could get more revenue if..." pressure.

---

## 3. Buyer Tiers

Three subscription tiers + a USD international variant. No Premium Buyer tier — eliminated per D-082.

### 3.1 Free Buyer

**Price:** ₦0
**Phase:** E (now)

**Capabilities:**
- Browse all listings, view real prices, save listings (bookmarks)
- In-app messaging with sellers (full quality, no message-count caps in Phase E)
- Make an Offer (per-day caps to prevent spam — exact cap TBD operationally)
- Escrow access on pay-per-use basis (1.5% + ₦100 fee, ₦50,000+ transactions)
- Report and block users
- 1 free contact reveal granted at signup (D-084; one-time, lifetime)

**Excluded:**
- WhatsApp/phone contact reveal (beyond the signup grant) — must purchase credit pack or subscribe to Pro
- SMS reply alerts
- Pro Buyer badge

### 3.2 Pro Buyer

**Price:** ₦5,000/month · ₦45,000/year (annual saves ~25% vs 12× monthly)
**Phase:** E (now)
**Launch promo:** ₦3,000/month first 3 months (see §3.3)

**Capabilities (everything in Free Buyer, plus):**
- WhatsApp + phone contact reveal on listings — with daily cap per D-083:
  - **New Pro Buyer** (subscription <30 days): 10 reveals/day
  - **Established Pro Buyer** (30+ days, no open reports): 25 reveals/day
- SMS reply alerts via Termii (per D-090 channels)
- Pro Buyer badge shown to sellers in inbox + conversation header
- "Priority inbox placement" — Pro conversations sort above Free Buyer conversations in seller inboxes, labeled "Pro buyer inquiry"
- **Discounted escrow fee:** 1.2% + ₦100 (vs 1.5% + ₦100 standard) — D-086
- Priority dispute response (24h first-response SLA vs 5-day Free; D-089). Fairness of dispute outcome is identical to Free — only response speed differs.
- Revealed contact history page (search/filter past reveals)
- Higher Make-an-Offer daily limits

**Reveal cap rationale:** Unlimited reveals create a contact-harvesting attack vector (D-083). A single bad actor could pay ₦5,000 once and scrape thousands of seller contacts for resale. The cap is generous enough that legitimate buyers never hit it (median buyer reveals 1–3 sellers/day even when actively shopping); restrictive enough that harvesting is economically uninteresting.

**Pro Buyer copy framing:**
- ✅ "Pro helps you reach sellers faster *and* transact safer."
- ❌ "Pro buyers see hidden prices" (prices are always visible per Principle 5)
- ❌ "Pro unlocks the marketplace" (free buyers have full marketplace access)

### 3.3 Pro Buyer Launch Promo

**Per D-087.**

- First 3 months of any Pro Buyer subscription: **₦3,000/month**
- Standard rate resumes month 4: **₦5,000/month**
- Annual plan unchanged at **₦45,000/year** — no promo applies (annual buyers self-select as committed; ₦45K already encodes ~25% discount vs 12× monthly standard)

**Operational mechanics:**
- Promo code value: `LAUNCH_3K`
- `subscriptions.promo_code` set on subscription creation
- `subscriptions.promo_expires_at = created_at + INTERVAL '90 days'`
- Paystack subscription created on the `pro_monthly_launch` plan (₦3,000 invoice limit 3); transitions to `pro_monthly_standard` (₦5,000, no invoice limit) on first Paystack invoice past the promo window
- Subscriber receives email + in-app notification 14 days before promo expiry:
  > "Your launch promo expires on [date]; subscription renews at ₦5,000/mo. Lock in launch pricing for the year — switch to annual at ₦45,000 (save ₦15,000)."

**"Launch" trigger:** Promo applies to subscriptions created any time after platform launch (defined as Stage 2.A — Termii OTP integration — going live). Per-subscriber rolling promo, not a calendar-window promo.

### 3.4 Diaspora Buyer

**Price:** $15/month · $150/year (USD billing)
**Phase:** E core (USD subscription + Pro features); Phase G for delivery coordination

**Target:** Nigerian diaspora ($24B+/yr remittance market) buying for family in Nigeria — laptops, phones, appliances, fashion. Highest-LTV individual tier.

**Capabilities (everything in Pro Buyer, plus):**
- USD/GBP card payment via Paystack international
- Delivery coordination to a NG recipient address (Phase G feature)
- Recipient verification: order arrives at recipient's address, recipient confirms receipt via SMS OTP before escrow release
- Buying-for-family flow — recipient phone number capture, delivery instructions, gift-message field

**Operational notes:**
- USD subscription billed via Paystack international (~3.5% processor fee vs ~1.5% for NGN)
- Phase E ships the USD subscription, USD escrow, and recipient field capture. **Delivery coordination is Phase G** — Diaspora subscribers in Phase E get all Pro Buyer features + the USD payment path + the buying-for-family fields, but the actual logistics integration arrives in Phase G.
- Marketing copy: "For Nigerians abroad. Buy with confidence. Deliver to family in Nigeria."

### 3.5 Institution Buyer

**Price:** Custom, starting from ~₦100,000/month
**Phase:** H+

**Target:** Bulk buyers — businesses procuring equipment, organizations buying multiple items, diaspora-organized group purchases, future B2B procurement.

**Capabilities:**
- Multi-seat (multiple buyer accounts under one billing entity)
- Custom escrow terms (negotiated dispute SLAs, custom payout timing)
- Bulk-buy support tooling
- Dedicated account manager
- Invoice/PO procurement support
- Custom reporting

**Operational:**
- Sales-led onboarding — not self-serve
- Pricing per contract; no published rate card
- Phase H+ work — schema scaffolded in E.1.3 (`institution_accounts` table), Phase H+ implementation pending

### 3.6 Buyer Signup Grant (D-084)

**Every new buyer receives 1 free contact reveal at signup.** Bounded, attack-resistant introduction to the contact-reveal feature.

**Operational:**
- `profiles.signup_free_reveals_remaining INT NOT NULL DEFAULT 1` (E.2.0.0 migration)
- First reveal attempted consumes the grant; decrements to 0
- After exhaustion, the buyer must buy a credit pack or subscribe to Pro
- Backfill on E.2.0.0 deploy: existing buyers with `created_at >= deployment_date - 30 days` get 1; older buyers get 0 (they've had ample pre-grant opportunity)

**Why 1 reveal, not a multi-reveal trial:**
- v1 plan proposed 14-day full Pro trial including unlimited reveals — rejected per D-084 as a harvesting attack vector
- 1 reveal demonstrates the feature without exposing the platform to contact-scraping
- Conversion to credit pack or Pro happens after the buyer has *experienced* the contact reveal flow, not after they've abstractly considered it

### 3.7 Reveal Caps (D-083)

| Buyer state | Daily reveal cap |
|---|---|
| New Pro Buyer (first 30 days of subscription) | 10 reveals/day |
| Established Pro Buyer (30+ days, no open reports) | 25 reveals/day |
| Institution Buyer | Custom per contract |
| Free Buyer with signup grant remaining | 1 lifetime free reveal |
| Free Buyer / credit pack user | Bounded by purchased credits, no daily rate cap |

**Implementation:**
- `get_buyer_reveal_cap(p_user_id UUID) RETURNS INT` SQL function (E.2.0.1 ships)
- "No open reports" computed on read: zero rows in `reports` where `target_type='user' AND target_id=user_id AND status IN ('new', 'in_review')`
- Cap reset at 00:00 Africa/Lagos
- Cap exhaustion UI: "You've used X of Y reveals today; resets at midnight Lagos time."

---

## 4. Credit Packs

**Per D-085.** Four pack tiers covering trial / occasional / committed / bulk use cases. Pay-per-use is expected to be the dominant buyer revenue stream by transaction count in Year 1 — Nigerian buyers prefer per-use to subscription for occasional features.

| Pack | Price | Reveals | Effective ₦/reveal | Use case |
|---|---|---|---|---|
| **Trial** | ₦500 | 1 | ₦500 | First-reveal "airtime moment" — friction-free entry point |
| **Small** | ₦1,500 | 3 | ₦500 | Occasional buyer, weekend-shopping mode |
| **Medium** | ₦3,500 | 9 | ₦389 | Committed but pre-subscription |
| **Large** | ₦7,000 | 20 | ₦350 | Bulk; bridges to Pro Monthly economics |

**Margin economics:** Credit packs have the strongest unit economics in the model. Paystack processor fee ~1.5% (capped); SMS cost ~₦40 per reveal *used*; near-zero ongoing variable cost; no churn risk. Net gross margin per pack: ~96%.

**Positioning rules:**
- ₦500 Trial pack is the "airtime moment" entry point — every Nigerian buyer is comfortable buying ₦500 airtime, and the price removes friction from first-reveal commitment
- Pro Monthly (₦5,000) is positioned for power users exceeding ~4 reveals/month, where subscription breakeven kicks in
- Marketing never frames Trial and Small as equivalent — they cost the same per reveal but Trial is "try once" and Small is "commit to a few"

**Storage / tracking:**
- Pack purchases tracked in `payments` table with `payment_type = 'credit_pack'`
- New enum column `pack_type` on `payments` (values: `'trial' | 'small' | 'medium' | 'large'`) — E.2.0.4 migration
- Credits accumulate on `credit_balances` table (running balance only, no per-pack metadata)
- Credit expiry: **6 months from purchase date** (matches earlier `PHASE_E_SPEC.md §11` design)

**Credit consumption order:** Signup grant (1 lifetime reveal) → Credit packs (FIFO by `credits_purchased_at`) → Pro subscription (covers if active). Buyer always pays the cheapest applicable source first.

---

## 5. Escrow

### 5.1 Eligibility

**Threshold:** Escrow available on transactions priced **₦50,000 or above**.

**Per D-082:** Pay-per-use, available to **all buyers** (Free, Pro, Diaspora). Not a Premium-tier-gated feature. There is no Premium Buyer subscription.

**Seller requirements** (operational, not monetization gates):
- Seller account active (not suspended/restricted)
- Seller verified, OR payout-ready (banking details captured during Phase G+ flow; in Phase E this means manual seller verification per the Phase C.5 baseline)
- Seller payout details valid

**The seller does NOT need a paid plan to receive escrow-protected orders.** A Free Seller can fulfill any number of escrow orders. This is Principle 1 — escrow is buyer-gated, never seller-gated.

### 5.2 Fee Structure (D-086)

| Buyer tier | Escrow fee on transaction value (V) |
|---|---|
| Free Buyer, Diaspora Buyer (standard), credit-pack-using buyer | **1.5% × V + ₦100** |
| Pro Buyer (any plan, including launch promo) | **1.2% × V + ₦100** |
| Institution Buyer | Custom per contract |

**Worked examples:**

| Transaction value | Free / standard fee | Pro discounted fee | Pro savings |
|---|---|---|---|
| ₦50,000 | ₦850 | ₦700 | ₦150 |
| ₦100,000 | ₦1,600 | ₦1,300 | ₦300 |
| ₦180,000 | ₦2,800 | ₦2,260 | ₦540 |
| ₦500,000 | ₦7,600 | ₦6,100 | ₦1,500 |
| ₦1,000,000 | ₦15,100 | ₦12,100 | ₦3,000 |

**Buyer pays:** transaction value + escrow fee. Total charged to buyer's payment instrument: `V + fee`.

**Seller receives:** transaction value (V) on successful release. ShowMePrice retains the fee.

### 5.3 Server-Side Recomputation (D-086)

**Client-supplied fee values are never trusted.** The `compute_escrow_fee(p_amount_kobo BIGINT, p_user_id UUID) RETURNS BIGINT` SQL function (E.2.0.2 migration) enforces tier-based rates server-side at the moment of escrow initiation.

Function logic:
1. Validate `p_amount_kobo >= 5,000,000` (₦50,000 threshold)
2. Determine effective rate by querying `subscriptions` for an active Pro subscription:
   - `WHERE user_id = p_user_id AND status = 'active' AND current_period_end > NOW()` → 1.2% rate
   - Otherwise → 1.5% rate
3. Return `(p_amount_kobo × rate) + 10000` (in kobo; ₦100 = 10,000 kobo)

Client-side fee display calls a read-only API for UX; the authoritative fee is the function's return value at escrow initiation. Any discrepancy between displayed and computed fee triggers an error, not a charge.

### 5.4 Refund Policy

**Refund scope (Phase E manual operation):**
- Buyer requests escrow refund: must do so before seller marks "shipped" / "delivered" / "completed" status (whichever applies)
- After seller-side fulfillment claim: refund moves to dispute resolution (§5.5)
- Admin-approved refund returns: `V + fee` (full refund — ShowMePrice eats the fee as gesture of good faith when refund is granted unilaterally)
- Admin-approved refund after dispute review: returns `V` only (fee retained as service charge for dispute operational work)

**Fee retention rationale:** When refund is granted without dispute (seller never marked shipped), ShowMePrice retains nothing — the buyer wasn't served, the fee shouldn't apply. When refund is granted after dispute review, the dispute operational work consumed real cost; the fee covers that.

### 5.5 Dispute Resolution

**Phase E: manual admin review only.** No automated dispute resolution. Admins review dispute case files containing:
- Conversation thread (in-app messaging trail)
- Listing details + listing edit history
- Buyer + seller history (prior reports, prior escrow transactions, account ages, verification statuses)
- Buyer's stated reason + supporting evidence (screenshots, photos)
- Seller's response

**Dispute outcomes:**
- **Refund to buyer** — `V` returned to buyer; fee retained
- **Release to seller** — `V` released to seller; fee retained
- **Partial settlement** — split V between buyer and seller (rare; requires both-party agreement)
- **Escalate** — case held pending additional evidence

**Per D-089 / Principle 6:** Dispute outcome fairness is identical regardless of buyer or seller tier. Tier metadata is segregated from the evidence-review surface to prevent unconscious bias. SLA response speed varies by tier (4h Institution / 24h Pro / 5-day Free first response) but outcome quality does not.

Phase F: dispute resolution dashboard with case clustering, repeat-offender pattern detection, automated case-priority ranking. Phase G+: dispute resolution automation for clear-cut cases (e.g., seller never shipped after 14 days = auto-refund).

---

## 6. Seller Monetization

**Per D-091: deferred to Phase F.** Phase E ships seller-side foundation only. No seller monetization in Year 1 first half.

### 6.1 Phase E — Seller Foundation (Free)

**Scope:** Per PHASE_E_SPEC.md §16 with `[Phase E]` markers:
- Seller profile creation and edit flow
- Listing creation with mandatory visible price (Principle 5)
- Verification application + admin review queue (Korapay NinVerifier per D-074)
- Founding Seller badge infrastructure (D-088; grants execute at Phase F launch)
- Seller report/block tools (D-089 / Principle 6)
- Mark-item-as-sold flow
- In-app inbox structure (no external messaging integrations)
- Listing categories: phones, laptops, electronics, appliances, generators (Phase E launch focus; full taxonomy preserved in schema for Phase F+)

**Phase E sellers retain unlimited listings** per existing `businesses.seller_listing_limit` nullable=unlimited spec. The 10-listing Free Seller cap applies only when Phase F launches monetization.

**Phase E seller experience is genuinely free and fully featured for the foundation use case.** No upsell prompts, no "upgrade to unlock" friction. The Founding Seller badge infrastructure ships in Phase E but grants are unannounced until Phase F launch.

### 6.2 Phase F — Pro Seller (₦7,500/month · ₦75,000/year)

**Per D-091 + D-088.** Launches when Phase F ships (target: 6–9 months post-Phase-E-launch, gated on buyer-demand metrics).

**Pro Seller capabilities** (beyond Free Seller foundation):
- Active listing cap: 50 (vs Free Seller's 10)
- Listing photos: 8/listing (vs Free's 3) — Phase F may revise based on storage cost data
- 3 monthly listing boosts included
- Quick-reply templates in inbox
- Standard analytics dashboard (listings, conversations, reply rate, sales-this-month)
- Faster admin support (24h SLA per D-089)
- Buyer trust signals in inbox (Pro Buyer indicator, escrow-eligible indicator, verified-buyer indicator)
- Enhanced seller storefront
- Optional opt-in to seller auto-reply (`seller_auto_reply` table)

**Founding Sellers (first 100 verified per D-088):**
- 6 months Pro Seller free starting at Phase F launch
- Permanent Founding Seller badge
- Grandfathered ₦7,500/month price for life (D-088 supersedes D-092 grandfathering scope for Founding Sellers — lifetime, not subscription-period)

### 6.3 Phase F+ — Premium Seller (₦15,000–₦20,000/month)

**Tentative; pricing locked at Phase F+ launch decision time.**

**Capabilities (beyond Pro Seller):**
- Active listing cap: 200 (vs Pro's 50)
- Custom storefront subdomain (e.g., `gradgear.showmeprice.ng`)
- Advanced analytics (cohort retention, conversion funnels, top-traffic-source breakdowns)
- Featured Seller placement eligibility (gated also on verification + reply rate ≥70% + zero open reports per §8.2)
- Bulk listing upload
- Priority verification review (8h SLA)
- Higher monthly boost allocation (10 vs Pro's 3)

### 6.4 Phase G — Institution Seller (Custom)

**Sales-led, custom contracts.**

**Target:** Distributors, large merchants, multi-branch retailers, high-volume sellers, organizations.

**Capabilities:**
- Unlimited active listings
- Multi-staff seller seats
- Multiple branches/locations under one business entity
- Custom seller dashboard
- Bulk upload + bulk operations
- API / inventory integration
- Dedicated onboarding
- Custom verification flow
- Custom escrow / payment / payout terms
- Logistics integration (Phase G+ delivery partners)

**Pricing starting from ₦75,000/month**, with annual contracts and onboarding fees negotiated per deal. No published rate card.

---

## 7. Founding Seller Offer

**Per D-088.** The first 100 verified sellers receive:

1. **6 months Pro Seller free** — free period **starts at Phase F launch**, not at seller verification. Sellers verified before Phase F see "Pro Seller features unlock free when Phase F launches" in their seller dashboard.
2. **Permanent "Founding Seller" badge** — displayed alongside Verified Seller badge. Distinct from paid-tier badges.
3. **Grandfathered ₦7,500/month Pro Seller pricing for life** — future Pro Seller price increases never apply to Founding Sellers. Per D-088 lifetime guarantee (supersedes D-092 subscription-period scope).
4. **Priority onboarding** — direct founder-led setup support.
5. **Free listing-quality review** — one-time review of all listings with feedback on photo quality, pricing competitiveness, description clarity.
6. **Early seller feedback group access** — direct line to product team for feature requests and friction reports.

**Schema infrastructure** (ships in Phase E per D-088 Operational; on `businesses` table):
```sql
ALTER TABLE businesses ADD COLUMN is_founding_seller BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE businesses ADD COLUMN founding_seller_granted_at TIMESTAMPTZ;
ALTER TABLE businesses ADD COLUMN grandfathered_pro_price_kobo INTEGER;
```

**Grant execution** (Phase F launch, admin-run script):
- Select first 100 sellers ordered by `seller_verifications.reviewed_at ASC` WHERE `seller_verifications.status = 'verified'`
- For each: set `is_founding_seller = TRUE`, `founding_seller_granted_at = NOW()`, `grandfathered_pro_price_kobo = 750000` (₦7,500)
- Email all 100: "You're a Founding Seller of ShowMePrice. Your Pro Seller features are unlocked free for 6 months; your Pro Seller price is locked at ₦7,500/month for life."

**Phase E does NOT execute the grant** — only stages the infrastructure.

---

## 8. Listing Boosts & Promoted Placement

**Per D-091: Phase F feature.** Phase E does not ship boosts or promoted placement.

Pricing and eligibility documented here for forward reference; implementation lands in Phase F.

### 8.1 Boost Pricing (Phase F)

| Boost type | Price | Eligibility |
|---|---|---|
| 3-day listing boost | ₦2,500 | Any seller (Free + paid) |
| 7-day listing boost | ₦5,000 | Any seller |
| 14-day listing boost | ₦9,000 | Any seller |
| Category top placement (7 days) | ₦10,000–₦15,000 | Verified sellers only |
| **Featured Seller** (7 days) | ₦15,000–₦30,000 | Eligibility-gated — see §8.2 |

Pro Seller subscription includes 3 monthly listing boosts; Premium Seller includes 10. Additional boosts beyond included quota are purchased à la carte at the rates above.

### 8.2 Featured Seller Eligibility Gating

**Featured Seller placement is gated on:**
- Verified Seller badge (verification approved by admin)
- Reply rate ≥70% on 30-day rolling window
- Zero open reports (no rows in `reports` where `target_type='user' AND target_id=seller_user_id AND status IN ('new', 'in_review')`)

**A seller without all three eligibility conditions cannot buy Featured placement regardless of willingness to pay.** No exceptions — this is structural enforcement of Principle 4 (paid promotion never overrides trust quality).

If a seller becomes ineligible mid-promotion (e.g., a report is filed against them during their Featured week), the placement continues for the paid duration but cannot be renewed until they regain eligibility.

### 8.3 Trust-First Ranking (Principle 4)

**Boost alone cannot push bad sellers to top.** Listing search ranking considers:

1. Verification status (verified > unverified)
2. Listing quality (photo count, description length, completeness, freshness)
3. Seller reply rate (higher = ranked higher)
4. Seller report history (any open report = penalty)
5. Seller plan tier (Pro+ ranked higher all else equal)
6. Boost active status (boost active = small lift, not dominant factor)
7. Listing freshness (newer = small lift)

**The rule:** a verified seller with 80% reply rate and zero reports outranks an unverified seller with 50% reply rate even if the latter is paying for the most expensive boost. Pay-to-rank is incompatible with trust-first marketplaces.

---

## 9. Payment Infrastructure

### 9.1 Paystack Primary (D-074)

**Phase E ships Paystack as the sole active payment processor.** Per D-074:
- Paystack covers: Pro Buyer subscriptions, Diaspora Buyer subscriptions (USD international), credit pack one-time charges, escrow holds and releases.
- Korapay is the named documented fallback for payments (D-078) but is NOT actively integrated in Phase E.
- Korapay's Phase E role is NIN verification only (D-074 — Korapay Identity service).
- Monnify was originally on the Phase G+ escrow shortlist but was deprioritized per D-074.

### 9.2 Channels Enabled at Launch (D-090)

**The Paystack integration in Stage 2.B must enable these channels at first launch, not as Phase F+ enhancements:**

| Channel | Coverage |
|---|---|
| `card` | Visa, Mastercard, Verve |
| `bank_transfer` | Covers OPay, PalmPay, Kuda, MoniePoint, traditional bank apps |
| `ussd` | Feature-phone fallback for buyers without smartphone banking |
| `mobile_money` | Where Paystack's mobile money channel covers it |

**Implementation:** Paystack `channels` array parameter on transaction initialization includes: `['card', 'bank_transfer', 'ussd', 'mobile_money']`. UI shows all available channels at checkout, not card-only. If a buyer's primary channel fails (e.g., OPay outage), the UI prompts retry with a different channel rather than blocking the transaction.

**Test plan:** at minimum one successful end-to-end transaction per channel before Stage 2.B ships to production.

**Rationale:** Nigerian transaction reality skews heavily toward mobile money and bank transfer rather than cards — particularly younger buyers and informal-economy participants who are core to the high-intent segment ShowMePrice targets. Card-only payment would lock out a material share of the addressable market.

### 9.3 Subscription Mechanics (Paystack subscriptions API)

**Phase E uses Paystack subscriptions for recurring Pro Buyer + Diaspora Buyer + (Phase F) Pro Seller billing.**

- **Plan codes** (Paystack dashboard):
  - `pro_monthly_launch` — ₦3,000, monthly, invoice_limit 3 (auto-transitions to `pro_monthly_standard` after 3 invoices)
  - `pro_monthly_standard` — ₦5,000, monthly, no invoice limit
  - `pro_annual_standard` — ₦45,000, annually, no invoice limit
  - *No `pro_annual_launch` plan — annual launch promo deliberately dropped per D-087. Annual subscribers go directly to `pro_annual_standard` at signup.*
- **Subscription lifecycle states** (Paystack-native, stored in `subscriptions.status`): `'active' | 'attention' | 'non-renewing' | 'completed' | 'cancelled'`
- **Webhooks** consumed via `PaymentGateway.handleWebhook()`:
  - `charge.success` (initial signup, renewal payments)
  - `subscription.create` / `subscription.disable`
  - `invoice.payment_failed` (dunning trigger)

---

## 10. Tier Comparison Tables

### 10.1 Buyer Comparison

| Capability | Free Buyer | Pro Buyer | Diaspora Buyer | Institution Buyer |
|---|---|---|---|---|
| **Price** | ₦0 | ₦5,000/mo (₦3,000 promo) · ₦45,000/yr | $15/mo · $150/yr | Custom from ₦100K/mo |
| Browse listings, real prices | ✅ | ✅ | ✅ | ✅ |
| Save listings | ✅ | ✅ | ✅ | ✅ |
| In-app messaging | ✅ | ✅ | ✅ | ✅ |
| Contact reveal (WhatsApp + phone) | ❌ (1 free at signup) | ✅ (10–25/day cap) | ✅ (10–25/day cap) | ✅ (custom) |
| SMS reply alerts | ❌ | ✅ | ✅ | ✅ |
| Pro Buyer badge | ❌ | ✅ | ✅ | Institution badge |
| Priority inbox placement | ❌ | ✅ | ✅ | ✅ |
| Escrow access | ✅ (pay-per-use, 1.5%+₦100) | ✅ (1.2%+₦100) | ✅ (1.2%+₦100) | ✅ (custom terms) |
| Priority dispute response | ❌ (5-day SLA) | ✅ (24h SLA) | ✅ (24h SLA) | ✅ (4h SLA) |
| USD payment | ❌ | ❌ | ✅ | Custom |
| Delivery coordination | ❌ | ❌ | ✅ (Phase G) | Custom |
| Multi-seat | ❌ | ❌ | ❌ | ✅ |
| Custom escrow terms | ❌ | ❌ | ❌ | ✅ |

### 10.2 Seller Comparison (Phase E ships only "Phase E" column)

| Capability | Phase E (all sellers, free) | Phase F: Pro Seller | Phase F+: Premium Seller | Phase G: Institution Seller |
|---|---|---|---|---|
| **Price** | ₦0 | ₦7,500/mo (₦75K/yr) | ₦15,000–₦20,000/mo | Custom from ₦75K/mo |
| Receive buyer messages | ✅ | ✅ | ✅ | ✅ |
| Create listings | ✅ unlimited | ✅ 50/seller | ✅ 200/seller | ✅ unlimited |
| Mark item as sold | ✅ | ✅ | ✅ | ✅ |
| Apply for verification | ✅ | ✅ | ✅ | ✅ |
| Report/block buyers | ✅ | ✅ | ✅ | ✅ |
| Founding Seller badge | ✅ (first 100 only, grant at Phase F) | ✅ | ✅ | ✅ |
| Quick-reply templates | ❌ | ✅ | ✅ | ✅ |
| Standard analytics | ❌ | ✅ | ✅ | ✅ |
| Advanced analytics | ❌ | ❌ | ✅ | ✅ |
| Listing boosts (monthly included) | ❌ | 3 | 10 | Custom |
| Featured Seller eligibility | ❌ | ✅ (if meets §8.2) | ✅ (if meets §8.2) | ✅ |
| Custom storefront subdomain | ❌ | ❌ | ✅ | ✅ |
| Bulk upload | ❌ | ❌ | ✅ | ✅ |
| Multi-staff seats | ❌ | ❌ | ❌ | ✅ |
| API / inventory integration | ❌ | ❌ | ❌ | ✅ |
| Admin SLA | 5-day | 24h | 8h | 4h |

---

## 11. Operational Rules

### 11.1 Pricing Revision Grandfathering (D-092)

**Any future pricing revision to Pro Buyer subscription, Pro Seller subscription, or escrow rates grandfathers existing active paid subscribers at their prior pricing for the duration of their active subscription period.**

- Active monthly subscribers continue at original rate until cancellation or non-renewal. New rate applies on renewal.
- Active annual subscribers continue at original annual rate through the full 12-month term. New rate applies on renewal.
- Escrow fee revisions apply at transaction initiation time. However, Pro Buyers who subscribed before a Pro discount-rate revision retain their original discount rate for the duration of their subscription.
- Founding Seller grandfathered ₦7,500/mo Pro Seller pricing (D-088) is **permanent**, not subscription-period-bounded. D-088 supersedes D-092 for Founding Sellers.

### 11.2 Trust & Safety SLA Tiers (D-089)

| Tier | First-response SLA | Resolution target |
|---|---|---|
| Institution Buyer / Institution Seller | 4 business hours | 24 business hours |
| Pro Buyer / Pro Seller / Diaspora Buyer | 24 business hours | 5 business days |
| Free Buyer / Free Seller | 5 business days | 14 business days |

**Phase E ships manual moderation with informal SLA tier separation** (operational reality of single-operator launch). Phase F implements queue prioritization in admin dashboard.

**Dispute outcome fairness is identical across all tiers (Principle 6).** Tier metadata is segregated from the evidence-review surface to prevent unconscious bias.

### 11.3 Subscription Cancellation

- User-initiated cancellation: subscription enters `cancel_at_period_end = TRUE` state; benefits continue until `current_period_end`; transitions to `status = 'cancelled'` on that date
- No mid-period refunds for user-initiated cancellation
- Admin-initiated cancellation (e.g., terms-of-service violation): immediate; pro-rated refund if applicable, at admin discretion
- Save-the-customer flow (14 days before promo expiry, per §3.3): in-app prompt + email offering annual switch

### 11.4 Free Reveal Grant Tracking

- `signup_free_reveals_remaining` decrements on first reveal attempt that would otherwise consume a credit or be denied
- Backfill rule on E.2.0.0 deploy: `created_at >= deployment_date - 30 days` → grant = 1; older → grant = 0
- No retroactive grants — buyers who signed up >30 days before E.2.0.0 deploy do not receive the grant

### 11.5 Pricing Display Discipline

- All NGN prices displayed with the ₦ symbol and tabular numerals
- USD prices for Diaspora Buyer displayed with `$` symbol and 2-decimal precision
- Escrow fees always displayed with the breakdown shown: "1.5% of ₦180,000 + ₦100 flat = ₦2,800"
- Pro Buyer discounted rates surface the savings explicitly: "Pro Buyer fee: ₦2,260 (save ₦540)"
- Promo prices always show the standard price below: "₦3,000/mo · launch promo · ₦5,000/mo after first 3 months"
- Never display "FREE" in promotional copy without a price ceiling (e.g., "Free for buyers" is fine; "FREE escrow!" is misleading)

---

## 12. Validation Disclosure

All pricing levels in this document represent **committed Phase E launch positions**, not speculative targets. The structural framework — trust-first tier separation, escrow buyer-gating, badge independence, principle adherence — is committed and not subject to revision without explicit decision banking.

Pricing points (Pro Buyer ₦5,000/mo, launch promo ₦3,000/mo, escrow rates 1.5%/1.2%, credit pack tier amounts, Pro Seller ₦7,500/mo) are subject to revision in two scenarios:

1. **Quarterly review during Year 1** based on actual conversion, retention, escrow uptake, and operational dispute capacity data from Phase E launch.
2. **Material market signal** prompting structural reconsideration. Example failure thresholds worth flagging:
   - Sustained Pro Buyer conversion below 0.5%
   - Escrow dispute rate above 15%
   - Seller churn above 40% in first 90 days post-Phase F launch

Any pricing revision is banked as a new D-number with rationale, supporting data, and effective date. Existing paid subscribers are grandfathered into their original pricing for the duration of their active subscription period (D-092). Founding Sellers are grandfathered for life on Pro Seller pricing (D-088 supersedes D-092 for Founding Sellers specifically).

This document is versioned (current: **v2.0**). Material changes increment the version.

---

## 13. Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| v1.0 | Phase E spec drafting | Frank + chat-Claude planning | Original four-tier monetization (Free / Pro / Premium / Institution buyer; Free / Pro / Premium / Institution seller all in Phase E) |
| **v2.0** | Sprint 1 banking session | Frank + repo-Claude | **Current.** Premium Buyer tier eliminated; escrow becomes pay-per-use with Pro Buyer discount; seller monetization deferred to Phase F; reveal caps added; Diaspora Buyer added; Founding Seller offer specified; payment channel commitment added; Validation Disclosure added; grandfathering specified. Banked as D-082 through D-092 in `DECISIONS.md`. |

---

**End of MONETIZATION-PLAN.md v2.0.**
