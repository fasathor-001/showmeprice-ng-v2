# Journal — 2026-05-22 — Strategic foundation (master plan v1.2)

**Type:** strategy/decision session (no code, no migrations). **Banked:** D-111 → D-117.

> **Reference this strategic foundation before any major architectural decision in Phase E or beyond.** The full master plan v1.2 lives outside the repo (Google Doc); this journal entry is the in-repo summary + decision index.

## Context
Paystack's reply (Tomiwa) confirming they offer **no escrow service** triggered a full strategic review of payment architecture — which expanded into a comprehensive strategic plan covering payments, positioning, monetization phasing, anti-abuse, launch sequencing, tiered listing access, and privacy.

## Paystack relationship state
- Tomiwa replied: no escrow product.
- Frank confirmed direction: **standard merchant onboarding for platform fees only** (contact-reveal credits etc.), NOT third-party fund custody.
- Awaiting KYB requirements from Paystack.

## Decisions banked (brief rationale)
- **D-111 — Payment architecture.** No buyer-seller money intermediation at MVP; Paystack = platform-fees-only; escrow → future licensed-partner pilot. Avoids BOFIA 2020 / CBN risk. *Supersedes the escrow-timing portion of D-082; makes D-086 + the escrow scaffolding dormant.*
- **D-112 — Trust-first positioning.** Compete on trust integrity, not volume; four operationalized differentiators; tagline "Real prices. Verified sellers. Safer deals."; never overclaim ("verified ≠ safe").
- **D-113 — Monetization phasing.** Free reveals in private beta (default 3); paid 1/5/15 packs at ₦300/₦1,200/₦3,000 from public beta; 20/day + 60s caps; Buyer Pro/fees/boosts/ads traction-triggered later. *Supersedes D-084 (free-reveal count) + D-085 (credit-pack structure); refines D-083 (caps); defers D-087.*
- **D-114 — Anti-abuse + signup/identity.** Rule-based detection (no ML), explainable flags, reports → review priority not auto-suspend; phone-OR-email signup with **phone OTP as the required identity gate**; phone uniqueness + normalization; international-phone policy; soft/hard-flag escalation; progressive account states; **all thresholds configurable.** *Refines D-022/D-040; resolves K-019.*
- **D-115 — Launch sequencing.** Three phases: private beta (Mo 3-4) → public beta (Mo 5-6) → public launch (Mo 7-9). Each de-risks the next. *(Changed from the implicit single-MVP-launch plan.)*
- **D-116 — Tiered listing access.** Level 1 Phone Verified (low-risk categories, <₦20k, max 2) → Level 2 Identity Reviewed (NG gov ID; standard categories, max 5) → Level 3 Business Verified (CAC; all categories, max 20). Visible per-level badge. *Refines D-091; introduces a 3-level verification model.*
- **D-117 — Privacy/data-protection (PLACEHOLDER).** ID/selfie/CAC/PII storage, access logging, retention/erasure, NDPR/GDPR. Full spec required **before public beta** (D-115 gates on it).
- **D-118 — Referral & word-of-mouth growth (PLACEHOLDER).** Trust-driven word-of-mouth is the primary growth lever (most credible signal in NG context). Private-beta invites are themselves structured referral. Reward structure / anti-abuse / economics / verification-gating / attribution to be fully specified before public beta. Must align with D-112 (trust-first), D-114 (anti-abuse), D-117 (privacy).

## Launch sequencing change
Single MVP launch → **private beta → public beta → public launch** (3-phase rollout). See D-115.

## What is NOT in MVP
Escrow · Manual Payout · Transfers-API seller settlement · Transaction Splits · any buyer-seller product-payment intermediation. (Per D-111. The dormant escrow scaffolding stays in the DB for a future licensed-partner pilot.)

## Strategic positioning locked
"Real prices. Verified sellers. Safer deals." — four operationalized differentiators (real prices enforced, multi-level honest verification, logged anti-harvesting reveals, rule-based fraud prevention + admin review). Per D-112.

## Engineering implications for Phase E
- **Existing Stage 2.B (messaging) work continues unchanged** — foundation closed (see `2026-05-22-stage-2b-db-foundation.md`).
- **Stage 2.C (trust visibility)** added — trust box, price-required UI, signup-flexibility UI, and **per-D-112 visible verification badge labels** (Phone Verified / Identity Reviewed / Business Verified): Phase 3 UI work needs badge components on **listing cards and seller profiles** (every listing shows what's checked).
- **Stage 2.D-light (basic anti-abuse infra)** added — phone normalization, configurable thresholds (`app_settings`), account-state machine.
- **Stage 4 (tiered listing access, D-116)** added.
- **Stage 2.E (reporting infra)** — planned for public beta.
- **Stage 2.F (contact-reveal credit system)** — planned for public beta.
- **Stage 3.A (Paystack integration)** — planned for public beta.
- **D-117 privacy work** required before public beta.

## Future engineering captured (documented, NOT built now)
- **New tables eventually:** `contact_reveals`, `buyer_reveal_credits`, `reports`, `blocks`, `admin_actions`, `otp_attempts`, `account_status_history`, `risk_events`, `listing_moderation_events`, `app_settings`.
- **New profile fields eventually:** `phone_normalized`, `account_status`, `verification_level`, `free_reveals_used`, `paid_reveals_balance`, `signup_ip_hash`, `last_ip_hash`, `report_count`, `block_count`.
- **Configurability principle:** all anti-abuse thresholds configurable, never hardcoded.

## Superseded / deferred decisions + now-stale deployed schema (reconciliation backlog)
These are flagged so Phase 3 planning reconciles them — NOT fixed in this commit:
- **D-082** (escrow ships Phase E) → escrow-timing portion superseded by D-111; tier framing stands.
- **D-083** (reveal caps 10/25) → refined by D-113: universal **20/day** anti-harvesting ceiling takes precedence; D-083's tier caps apply *within* it once Buyer Pro ships (new Pro 10/day, established Pro **20/day — capped down from 25**) + 60s cooldown. `get_buyer_reveal_cap()` to be reworked.
- **D-084** (1 free reveal at signup) → superseded by D-113; `profiles.signup_free_reveals_remaining` DEFAULT 1 now stale.
- **D-085** (credit packs trial/small/medium/large) → superseded by D-113 (1/5/15 packs); `credit_pack_type` enum + `payments.pack_type` CHECK now mismatched.
- **D-086** escrow fee mechanics + `compute_escrow_fee()` → dormant (D-111).
- **K-019** (international phone policy) → **resolved by D-114; moved to KNOWN_ISSUES "Resolved"** this commit. Phone-handling implementation (normalization, uniqueness, +234-vs-international free-reveal gating) is forward Phase 3 work.
- **PHASE_E_SPEC §1.5 + MONETIZATION-PLAN.md** still frame escrow/old pricing as Phase E → superseded by D-111/D-113; needs a spec pass.

## Next session
Resume normal Stage 2.B implementation (Phase 3). No strategic blockers outstanding.
