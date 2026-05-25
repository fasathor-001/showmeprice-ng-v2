# PENDING DECISIONS — Bank after Stage 2.B completes

Three strategic decisions about advertising/promotion posture, drafted during Stage 2.B work but deferred for banking until Stage 2.B fully completes (to keep commit log focused on messaging work).

**When to bank:** After Commit 6 (polish) or Commit 7 (MessageSellerButton) ships and Stage 2.B is marked complete.

**Commit message when banked:** `docs(decisions): bank D-122 + D-123 + D-123b — advertising posture and promotion architecture`

---

## D-122: Advertising Posture

Decision: ShowMePrice does NOT show third-party display ads (AdSense, Meta Audience Network, banner ad networks). Revenue from advertising-style surfaces comes only from marketplace-native promotion.

Allowed monetization surfaces:
1. Promoted Listings — sellers pay to boost their own verified listings
2. Sponsored merchant placements — verified businesses in relevant categories (post-traction)
3. Cross-promotion of ShowMePrice features and subscriptions
4. Category sponsorship — verified merchants funding category-wide visibility (post-traction)

Reasoning: D-112 trust-first positioning is undermined by third-party display ads. Marketplace-native promotion aligns platform incentives with user trust — platform earns when sellers transact, not when buyers see ads. Mature marketplaces (eBay, Amazon, Facebook Marketplace) monetize through promoted listings, not banner inventory.

Forbidden in any commit or feature:
- AdSense, Meta Audience Network, or similar third-party ad network integration
- Affiliate link injection in user content
- Popup, interstitial, or autoplay ad surfaces
- Cross-platform ad tracking from third-party networks (Facebook Pixel, Google Ads remarketing, etc., except for ShowMePrice's own marketing campaigns)

Related: D-112 (trust-first positioning), D-123 (promotion architecture), D-123b (activation triggers)

---

## D-123: Marketplace Promotion Architecture

Decision: ShowMePrice's promotion model is trust-weighted, not pay-to-win.

Core principles:
1. ADDITIVE boost weight within trust tier, never multiplicative across tiers — paying sellers move up among their peers, never above substantially more trusted sellers
2. VERIFIED-ONLY boost eligibility — verification is a prerequisite to boost, not an outcome of paying
3. DENSITY-CAPPED — maximum 20% of any category/search results page is promoted; organic results dominate
4. VISIBLY LABELED — all boosted listings show a "Featured" or "Promoted" indicator (transparency to buyers)
5. FIXED PRICING — no auctions or dynamic pricing at MVP; seller predictability matters

MVP scope (infrastructure only, NOT monetization activation):
- Listings table boost columns (boost_until, boost_tier)
- Marketplace search/sort respects boost priority WITHIN trust tier
- Category pages render "Featured" section distinct from organic
- Boost transactions flow through standard Paystack merchant flow
- Operational infrastructure: refund policy for suspended boosts, admin disable-on-violation flow, listing-edit-revokes-boost rule, boost-end cron

Post-MVP roadmap (in order):
- Featured Listings (single tier, ₦TBD per 3 days)
- Search Boosts (boost visibility for specific category for X days)
- Seller Spotlight ("Trusted Sellers in Lagos" featured carousels)
- Category Sponsorship ("Verified Laptop Week")
- Response-rate-as-boost-eligibility (sellers with low reply rate lose boost privilege)
- Boost-effectiveness analytics dashboard for sellers (ROI visibility)

Cautions (banked for future awareness):
- "Featured" labels reduce boost effectiveness for label-aware buyers; price boosts accordingly
- Verified sellers may not be highest-paying boost cohort; revenue may concentrate in less-trust-conscious-but-verified sellers
- Do NOT publicly position as "trust-ranked marketplace" until ranking data validates the claim

Out of scope at any stage:
- Pay-to-win ranking (boost overriding trust)
- Hidden promotions (all boosts visibly labeled)
- Boost auctions or dynamic pricing

Related: D-122 (advertising posture), D-123b (activation triggers), D-112 (trust-first positioning), D-113 (contact reveal credits — primary revenue)

---

## D-123b: Promotion Activation Trigger

Decision: Activate boost monetization (begin selling Featured Listings) when ALL conditions met:
- Active listings >100 per major category (phones, laptops, generators)
- >50 verified sellers across the platform
- Buyer messaging traffic averages >10 conversations/day
- At least one fraud incident successfully prevented by trust filters (validates trust signals work)

Before all four conditions met: build infrastructure quietly, do not sell boosts.
After all four conditions met: ship Featured Listings, market to verified sellers, measure click/transaction lift over 30 days before expanding to other boost tiers.

Thresholds are placeholder targets; revise quarterly based on actual marketplace behavior. Track-back: if any threshold turns out to be wrong, document why and update.

Related: D-122, D-123

---

## D-125: Launch Strategy — "Simple Internally, Premium Externally"

**Status:** Pending formal banking in DECISIONS.md
**Drafted:** Sunday, May 24, 2026
**Banked formally:** [pending]

**Intent:** D-125 is not temporary launch guidance. It is enduring product-governance doctrine for ShowMePrice — foundational philosophy intended to outlast Stage 2.C and shape product decisions across all phases of the platform's life.

### Doctrine foundation

> "Trust compounds slowly and breaks quickly."

Every governance principle, phase decision, and scope classification in D-125 derives from this foundation. Trust is the platform's only durable moat; protecting it is the highest-priority product activity.

### Anchor question — permanent governance filter

Apply to every roadmap, design, moderation, onboarding, and monetization decision:

> "Does this reduce user uncertainty and increase transaction confidence?"

If yes: invest. If no: defer or reject. Apply across:

- Roadmap filtering
- Design review
- Moderation policy review
- Onboarding flow review
- Monetization decisions
- Feature-request triage

### Core principle

> "Launch quality matters more than launch complexity."

### Governance principles

ShowMePrice operates under eight enduring governance principles. Each closes a specific failure mode common in Nigerian marketplaces.

**1. Trust over novelty**

> Ship features because they reduce friction, confusion, or uncertainty. Do not ship features because they feel innovative. Nigerian marketplaces are already overloaded with gimmicks, clutter, overgrowth, and inconsistent flows. ShowMePrice feels intentional, restrained, and stable.

**2. Consistency over velocity**

> ShowMePrice prioritizes consistency over feature velocity. A slower, coherent platform is preferred over rapid expansion that weakens trust, usability, or product coherence. Post-traction pressure to ship faster than coherence allows is explicitly resisted.

**3. Every trust surface matters**

> Trust is shaped not only by major features, but by every interaction surface — including loading states, retries, notifications, onboarding, moderation messaging, recovery flows, empty states, and mobile responsiveness. These are not minor UX. They ARE trust infrastructure and receive Tier 1 treatment per D-124.

**4. Calm over engagement**

> ShowMePrice prioritizes calm confidence over addictive engagement mechanics. Streaks, feeds, dopamine notifications, infinite scroll, and viral UX patterns are explicitly rejected. Differentiation comes from calmness, not engagement-loop optimization. This protects the platform's positioning against Facebook Marketplace, Instagram commerce, and TikTok commerce patterns.

**5. Real-world reliability over benchmark optimization**

> Real-world reliability under typical Nigerian mobile conditions is prioritized over synthetic benchmark performance. Lighthouse scores and lab metrics matter less than performance under weak MTN signal, Android memory pressure, tab backgrounding, and unstable network or power conditions. Tested on real devices on real carrier networks — not desktop emulation alone.

**6. Human moderation before automation escalation**

> ShowMePrice prefers human-understandable moderation systems before introducing heavier automation or opaque trust scoring. Automation is built on observed patterns from real platform usage (Phase 2), never on speculative heuristics. This protects against opaque moderation, over-automation, and trust-damaging false positives.

**7. Marketplace-native, not social-media-native**

> Features reinforce commerce confidence and transaction clarity rather than imitate social-media engagement patterns. Messaging is calm commerce communication, not generic social chat. Image sharing is product-context-aware (caption-below-grid, hero-image layout, listing chip in viewer), not generic photo sharing. Protects against drift toward stories, feeds, algorithmic distraction, and vanity engagement systems.

**8. Launch quality over launch quantity**

> The moat is calmer, more trustworthy, more coherent commerce UX — not more features, more tabs, or more systems. Startup pressure to "ship more" is explicitly resisted when shipping more weakens any of the above seven principles.

### Strategic risk — what D-125 protects against

> **ShowMePrice should never become noisy.**

This is the biggest long-term strategic risk. Nigerian marketplaces naturally drift toward clutter: sellers demand visibility hacks, monetization pressures create UI pollution, growth pressure creates engagement spam, feature requests pile on. D-125 is the doctrine that protects calmness.

### Phase structure

**Phase 1 — TRUSTABLE MVP (CURRENT)**

Focus: UX polish, listings, messaging, verification, moderation basics, contact reveal flow, mobile polish.

Goal: "This feels safer and more professional than competitors."

NOT: "This has every feature."

**Phase 2 — MARKETPLACE LEARNING (post-launch, after real users arrive)**

Observe: fraud patterns, seller behavior, reveal behavior, negotiation patterns, moderation load.

Real marketplace intelligence starts only after real data exists. **Sequencing note: Phase 2 must complete before Phase 3 begins** — real fraud patterns must be observed before automation logic becomes trustworthy.

**Phase 3 — TRUST INTELLIGENCE (only after Phase 2 yields data)**

Behavioral scoring, trust weighting, sophisticated ranking, moderation intelligence, fraud heuristics.

Requires real observational data from Phase 2 to be meaningful. Automation built on speculation rather than observation is rejected per Principle 6.

**Phase 4 — MARKETPLACE SCALE (only after liquidity exists)**

Advanced promotions (Featured Listings per D-123/D-123b), seller ecosystems, diaspora systems, logistics partnerships, institutional tooling.

### Launch scope classification

**FULLY IMPLEMENT NOW:**

- UX/UI polish (per D-121 + D-124)
- Messaging quality (Stage 2.B complete; Stage 2.C image sharing in progress)
- Verification basics (phone verification working; tiers framework ready)
- Moderation basics (D-119 filter operational)
- Legal/privacy foundation (Terms + Privacy Policy drafts ready for lawyer review)
- Mobile-first quality (Nigerian Android-first realities)
- Trust presentation (verification badges, response signals)
- Reveal system (D-113 contact reveal)
- Admin visibility/logging (basic moderation evidence retention)

**PARTIALLY IMPLEMENT NOW (infrastructure stub, intelligence deferred):**

- Boosts infrastructure (per D-123 architecture, activation per D-123b — DO NOT activate at launch)
- Moderation intelligence (D-119 filter exists; sophistication evolves with observed fraud per Principle 6)
- Trust-ranking (additive framework per D-123; sophisticated ranking science deferred to Phase 3)
- Analytics (basic operational metrics only)
- Seller scoring (basic ratings infrastructure; behavioral scoring deferred to Phase 3)

**DELAY UNTIL DATA OR LIQUIDITY EXISTS:**

- Escrow / fund custody (per D-111 — explicitly NOT a launch feature)
- Advanced AI moderation (current D-119 filter is enough at launch)
- Sophisticated ranking science (requires Phase 2 data per Principle 6)
- Complex automation (manual operational steps acceptable at MVP)
- Enterprise-scale systems (architecture sized for thousands, not millions)

### The biggest mistake to avoid

> "Imagined scale architecture" — systems optimized for millions of users before validating thousands. This kills many startups. Do not build for scale that hasn't been validated.

### ShowMePrice's moat is

- Trust
- UX
- Emotional professionalism (per D-121 + D-124)
- Structured commerce
- Calmness (per Principle 4)

NOT:

- Maximum features
- Enterprise-scale architecture
- Hyper-automation
- Engagement-loop optimization

### What "premium externally" actually means

Premium for Nigerian marketplaces means:

- Clear feedback at every interaction
- Visible trust signals
- Strong mobile responsiveness
- Reliable messaging
- Graceful recovery from errors
- Emotional stability under stress

Premium does NOT mean:

- Sterile minimalism
- Empty interfaces
- Information-deprived screens
- Cold, distant UX

**Reference products** (for premium quality calibration): Stripe, Linear, Airbnb, Apple, Telegram, premium Nigerian fintech apps. These emphasize clarity, calmness, polish, confidence, and intentionality — not entertainment, virality, or dopamine loops.

### What "world-class" means at launch

| World-class IS | World-class is NOT |
|----------------|---------------------|
| Calm | Feature-complete |
| Polished | Enterprise-scale |
| Responsive | Hyper-automated |
| Trustworthy | Engagement-optimized |
| Coherent | Cluttered |
| Emotionally stable | Noisy |
| Intentionally designed | Imitation-driven |
| Reliable under real conditions | Benchmark-optimized |

### Operational implications

- Surface findings under D-121/D-124 should explicitly classify proposed features by phase (Phase 1 vs Phase 2/3/4 work)
- Resist "while we're in here, let's also add X" expansions that build for unvalidated scale
- Stage scoping decisions reference this D-125 phase framework
- Apply the anchor question to every meaningful product decision
- Apply the eight governance principles when evaluating feature requests, design choices, monetization options, and roadmap pressure
- Re-evaluate quarterly as marketplace data accumulates
- D-125 should be referenced by future agent sessions as foundational doctrine, not temporary MVP guidance

### Related decisions

- **D-111** (No financial custody at MVP) — supports "delay escrow"
- **D-112** (Trust-first positioning) — defines what "world-class" means for ShowMePrice
- **D-119** (Phone-number filter for moderation) — concrete application of Principle 6
- **D-121** (UX/UI quality standard) — defines what "polished" means
- **D-122** (Advertising posture) — supports "delay advanced promotions" + Principle 4 (no engagement-style ad surfaces)
- **D-123 / D-123b** (Promotion architecture + activation triggers) — supports "partial implementation now, activation when conditions met"
- **D-124** (Product quality operational doctrine) — Tier 1/2 classification supports "polished externally, manageable internally" + Principle 3 (every trust surface matters)

---

## D-126 — Communication & Content Doctrine

**Status:** Locked (2026-05-25)
**Cross-references:** D-124 (Calm UI), D-125 (Trust narrative + governance doctrine)

### The principle

ShowMePrice's moat is product, not content. The platform's communication
to users — every email, notification, message, in-app prompt, journal
piece, future newsletter — exists to serve trust, never to manufacture
engagement.

### Communication posture

Intelligence-first, never promotion-first.

The brand psychology goal: users learn that ShowMePrice only contacts
them when there is genuine value to deliver. Over time, this becomes
a competitive advantage — attention that Nigerian users have learned
to withhold from platforms that have trained them to ignore notifications.

### What this means in practice

**For transactional emails (live now):**
- One action triggers one email. No follow-up sequences.
- Calm baseline tone — no exclamation marks, no celebration emoji,
  no marketing copy bleeding into transactional surfaces.
- Reference points: Stripe, Linear, Apple — not generic SaaS or
  Nigerian e-commerce.

**For future communication surfaces (newsletter, journal, etc.):**
- Content categories that fit: pricing trends, trust insights, scam
  awareness, category movement, seller standards, buyer safety,
  verification mechanics, safe-commerce education.
- Content categories that do NOT fit: promotional roundups,
  "trending now" engagement loops, FOMO-driven highlights, generic
  e-commerce content, AI-written filler.

### Cadence boundaries

Monthly maximum for any subscription-based communication.
Never daily. ShowMePrice should never train users to expect frequent
contact.

### What ShowMePrice does NOT do

- 🎉 emoji or "Welcome aboard!" hustle copy
- Marketing communications mixed into transactional emails
- Newsletter subscription prompts in transactional flows
- Discount offers (impossible by business model — D-125 §2.3 No Custody)
- Engagement loops or growth-hack tactics in communication

### Why this matters for Nigerian marketplace context

Nigerian users have developed strong skepticism toward promotional
marketplace communication due to the noise level of modern commerce
platforms. That skepticism is rational given how attention has been
treated by mainstream e-commerce.

ShowMePrice's positioning advantage is being recognizably different.
A user who receives ShowMePrice email expects it to be useful, because
ShowMePrice has demonstrated that it doesn't send anything else.

This doctrine is foundational. It shapes every adjacent decision:
journal content shape, future newsletter scope, in-app prompts,
moderation tone, even how customer support communicates.

---

## D-127 — Journal Surface (`/journal`)

**Status:** Locked architecturally (2026-05-25); implementation deferred
to Stage 3
**Cross-references:** D-125, D-126

### The principle

ShowMePrice's content surface is a journal — not a blog, not a
content marketing channel, not an SEO play.

A journal is reflective, authoritative, and slow. It exists to compound
trust through trust intelligence — education about safe commerce,
verification mechanics, fraud awareness, and marketplace patterns
specific to the Nigerian context.

### URL path

`/journal`

Not `/blog`, not `/learn`, not `/news`, not `/insights`.

Reasoning: "Journal" carries premium tone aligned with calm brand
positioning. "Blog" sounds generic. "Learn" sounds tutorial-driven.
"News" suggests recency cadence. "Insights" sounds corporate.

### Content shape

Trust intelligence pieces, not content marketing posts.

**Aligned content categories:**
- Fraud pattern education (e.g., "How fake payment alerts work in Nigeria")
- Pre-purchase verification guidance (e.g., "What to verify before
  buying a used iPhone")
- Platform mechanics transparency (e.g., "How seller verification
  works on ShowMePrice")
- Category-specific scam awareness (e.g., "Common generator scam
  patterns")
- Marketplace economics (e.g., "Why price transparency matters")
- Safe inter-state commerce (e.g., "How to safely buy outside your state")

**Anti-patterns explicitly rejected:**
- SEO roundup content ("10 best phones under ₦200k")
- AI-written filler
- "Trending now" engagement-hack pieces
- Generic e-commerce content
- Anything that exists to game search rankings rather than serve readers

### Launch shape

Ship 3-5 foundational pieces at once. A single-post journal feels
abandoned. The opening collection establishes ShowMePrice as the
authority on safe Nigerian commerce from day one.

### Cadence post-launch

Slow and authoritative. No commitment to weekly or even monthly
output. A piece ships when there's something genuinely worth saying,
not because the editorial calendar demands it.

If/when the journal stabilizes with regular content velocity, a
newsletter delivery mechanism may emerge — but the newsletter is a
distribution surface for journal content, never a separate content
stream.

### Why this comes before a newsletter

Journal content is:
- Evergreen (vs newsletter which expires after sending)
- Searchable via Google (compounds organically over time)
- Referenceable (can be linked from Terms, Privacy, About,
  transactional emails, customer support replies)
- Operationally low-pressure (no subscriber list to maintain, no
  send cadence pressure, no unsubscribe management)
- Calm (no inbox interruption)

Journal precedes newsletter. Newsletter without journal is
promotional. Newsletter as delivery mechanism for journal content
is intelligence-first per D-126.

**The journal exists to increase transaction confidence, not platform
engagement.** This anchor sentence prevents future drift toward
engagement-optimization patterns that would erode trust positioning.

### Implementation timing

Stage 3+. After private beta operations stabilize, after Stage 2.C
fully closes, after Commits 11 and 12 ship. Not before.

When implemented, technical scope: static MDX or markdown-based
routes under `/journal/[slug]`, no commenting system, no engagement
mechanics, no email-capture forms, no related-posts engagement loops.

---

## Operational Doctrine — Implementation-Path Independence

**Status:** Locked (2026-05-25, surfaced during Commit 11 K-055 deferral deliberation)

**Cross-references:** D-125 (trust governance), agent-handoff doctrine, KNOWN_ISSUES.md K-055 resolution note

### The principle

Implementation-path failure does not automatically redefine feature-objective completion.

When an approved implementation path proves invalid mid-work, the underlying objective does NOT automatically close via partial work completed via alternative paths. The path is replaceable; the objective remains open until objectively met or explicitly deferred via documented decision.

### Example case (K-055)

DP-8 approved "Attempt next/image first, fallback to manual if unsupported." Investigation revealed next/image is incompatible with Cloudflare Pages free tier. The partial work delivered (`loading="lazy"` on plain `<img>` via K-053 ProductImage wrapper) addresses one DP-9 concern (lazy-load) but does NOT close K-055's full scope (responsive srcset/sizes per DP-10).

The correct disposition: K-055 remains OPEN with explicit deferral note, not silently closed via partial delivery.

### Operational implications

For agents implementing approved DPs:
- Approved DPs are deliverables, not aspirations
- If an implementation path proves invalid, escalate the path failure
- Do NOT silently substitute partial alternative work and frame as "complete"
- Path failure → escalate scope decision → wait for Frank → then proceed
- Silent descope (regardless of how reasonable the partial delivery looks) is a discipline failure

For Frank reviewing agent reports:
- Verify all approved DPs are explicitly addressed (delivered, deferred, or escalated)
- "Optional enhancement" framing on a previously-approved DP is a silent descope signal
- Investigation findings → product judgment (Frank decides) → then proceed

This doctrine shapes all future agent escalation patterns and commit verification workflows.
