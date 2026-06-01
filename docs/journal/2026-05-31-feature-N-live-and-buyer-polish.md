# Journal — 2026-05-31 — Feature N (WhatsApp reveal) live + buyer-facing polish + legal prep

**Continues:** `2026-05-28-stage-1-admin-tools-plus-settings-hub.md`. **Commit range covered here:** `c08878e` → `15a87b2` — eight code/docs commits across this session, plus the production application of one DB migration and the live end-to-end test of Feature N with a real buyer.

## Headline — the buyer reveal loop is closed end-to-end

The platform now has a working buyer-side conversion path on top of the trust loop. A real Nigerian buyer signed in, tapped Reveal WhatsApp on a verified seller's listing, got the verified number, tapped Open WhatsApp, and landed in a prefilled chat with the seller. Three slices, one migration applied, four commits, one production deploy, one successful live test. Combined with the city-casing polish that ships across every public buyer surface via a single helper change, the public side of the marketplace now reads polished and works end-to-end on the conversion event ShowMePrice was built around.

Equally important: today produced the second seller actually posting listings (kay_interiors_hub), bringing real product diversity to a marketplace that until now was a single seller in fashion. Supply growth is the real win; everything else is infrastructure that supports it.

## Shipped (in order)

| # | Commit | Subject |
|---|---|---|
| 1 | `c08878e` | `feat(admin): add registration details panel to verification detail page` (Feature R) |
| 2 | `9789958` | `feat(admin): link business name to shop on verification detail when verified` (Feature R follow-up) |
| 3 | `36b1b17` | `fix(admin): show business location on user detail page instead of empty profile state` |
| 4 | `26d2dde` | `feat(db): add reveal_seller_contact rpc for buyer whatsapp reveal (feature N slice 1)` |
| 5 | `7cab1a3` | `feat(reveals): add reveal_seller_contact server action wrapper (feature N slice 2)` |
| 6 | `731045c` | `feat(listings): add whatsapp reveal button to listing detail (feature N slice 3)` |
| 7 | `0359305` | `fix(location): title-case city across public surfaces + gate empty listing description` |
| 8 | `f7f5de3` | `docs(decisions): bank D-153 Feature Q finalized design resolving D-151 open questions` |
| 9 | `c4a39ba` | `docs(decisions): amend D-153 vehicle verification standards` (D-153a) |
| 10 | `716d5b6` | `docs(decisions): bank D-154 verified dispatch hub future buyer-protection service` |
| 11 | `fecbf54` | `docs(decisions): bank D-155 terms of service signup acceptance mechanism (content lawyer-gated)` |
| 12 | `15a87b2` | `docs(decisions): bank D-156 avatar uploader square-crop guidance improvement` |

Plus earlier same-day commits already journaled in the immediately-preceding work-stream: `f0b6541` (tracker update), `b34b285` (D-152 bank).

## Shipped & live — Feature N (WhatsApp contact reveal)

All three slices built, committed, pushed, deployed, and live-tested in production with a real buyer.

- **Slice 1 — `reveal_seller_contact` RPC** (`26d2dde`, migration `E.2.21.0-reveal-seller-contact-rpc.sql`). SECURITY DEFINER, `search_path=public`, transaction-local GUC bypass to decrement `signup_free_reveals_remaining` against the E.2.14.0 freeze trigger. Per-seller dedup. `FOR UPDATE` row lock on the buyer profile to defeat double-click double-spend. `BEGIN/EXCEPTION` rollback of the decrement on listing-FK violation. Dry-ran GREEN against live data on all six cases (`self_reveal`, `seller_whatsapp_not_available`, `revealed`, `already_revealed`, `no_reveals_remaining`, `listing_unavailable`) inside a rolled-back transaction; ACL locked down per the E.2.16.0 triple-REVOKE precedent — `REVOKE FROM PUBLIC + anon + service_role`, `GRANT TO authenticated`. Migration applied to production.
- **Slice 2 — `revealSellerContactAction` server-action wrapper** (`7cab1a3`, `src/lib/reveals/{actions,types}.ts`). The security-critical bind: `p_buyer_id` is taken from the authenticated session via `requireActiveUser()`, never from a client argument. Suspended buyers (J.4) rejected before the RPC fires. Discriminated-union result type makes `whatsapp` structurally absent on every non-reveal variant; the action also re-strips at runtime as belt-and-braces.
- **Slice 3 — `RevealContactButton` UI** (`731045c`, `src/components/listings/RevealContactButton.tsx`). Secondary outline CTA stacked beneath the primary Message Seller button on the listing detail page. Mobile flow: Message stays sticky-bottom; Reveal renders in document flow so the two CTAs don't compete for the single sticky slot. On reveal success: number panel + primary "Open WhatsApp" linking to `wa.me/<E.164>?text=<prefilled>`. On `no_reveals_remaining`: locked Option-B copy ("You've used your 3 free WhatsApp reveals. Continue with Message seller."). On seller-side unavailability: hidden entirely (no error scream — messaging remains the path).
- **Live test PASSED.** A real buyer signed into production, tapped Reveal on a verified seller's listing, received the masked-then-displayed number, tapped Open WhatsApp, and landed in a prefilled chat. Counter decremented as expected; subsequent re-tap on the same seller returned `already_revealed` without further decrement (per-seller dedup confirmed in production).

## Shipped & live — buyer-facing polish

- **City casing across all public surfaces + empty-description gate** (`0359305`). Folded `titleCaseCity` into `formatLocation` so a free-text `city_area` like `"warri"` renders as `"Warri, Delta"` everywhere via a single helper change. Covers every ListingCard consumer (marketplace, categories, homepage, MoreFromSeller, seller-shop grid), the seller-shop header, both listing-detail location surfaces, and the admin user page. Also gated the `<h2>Description</h2>` block on listing detail with `listing.description && (...)` so a NULL row no longer renders a labelled empty paragraph. Net diff: 53 insertions / 31 deletions across 3 files; eliminated repeated explicit-wrap call sites in favor of one helper application.

All Feature N + polish commits pushed to `origin/main`.

## Earlier same-day shipped (already committed before the Feature N work-stream)

- **Feature R — Registration details panel on admin verification queue detail** (`c08878e`). Read-only panel above the existing identity / address / business cards on `src/app/admin/verifications/[id]/page.tsx`, surfacing display name, email, profile phone, business WhatsApp + verified-flag, user type, and account created-at. Email read via `adminClient.auth.admin.getUserById(business.owner_id)` folded into a parallel `Promise.all` with the existing storage signed-URL calls. No PII crosses into a client component — every field renders server-side; `ReviewActions` still receives only `verificationId`. One file edit, no new server actions, no schema change.
- **Feature R follow-up — business-name → shop link on verified detail** (`9789958`). When `verification.status === 'verified'` and the business has a `slug`, the business name on the detail page links to `/sellers/<slug>` in a new tab; pending/rejected still render plain text. Single file, single hunk.
- **Location fix on admin user page** (`36b1b17`). Re-pointed the admin user detail "Location" field from the always-empty `profiles.state_id` to the seller's business location (`businesses.city_area + businesses.state`) formatted through the existing helper. Diagnosed earlier: `profiles.state_id` is structurally never written by any signup path; only the admin `Change Location` RPC writes it. Fix surfaces real data on a previously-broken admin field. Multi-business case is moot — `businesses.owner_id` is UNIQUE by schema.

## Decisions banked (DECISIONS.md)

All four decisions committed; nothing dormant in the working tree.

- **D-153** — Feature Q finalized design: category-specific enhanced verification (resolves D-151 open questions). Phased Q.1–Q.4 build, hard gate on Tier A (Vehicles, Real Estate), soft on Tier B (premium electronics, jewelry/watches), grandfathering for current Tier C verified sellers, branching doc requirements via `category_verification_requirements` table, separate enhanced-verification record (not an enum value).
- **D-153a** — Vehicle Enhanced Verification Amendment. Three vehicle branches (Nigerian-used / Tokunbo-imported / brand-new), standing copy rule "reviewed not guaranteed" for documents, interim private-beta collection checklist with email bridge that expires when Q.2 ships.
- **D-154** — ShowMePrice Verified Dispatch / Hub: future buyer-protection service. NOT default model. Phase 1 (now): identity-verified introduction marketplace. Phase 2 (future pilot): optional paid hub for small high-value categories. Phase 3 (later): escrow on top of hub.
- **D-155** — Terms of Service acceptance at signup. Mechanism buildable, content lawyer-gated, build DEFERRED until counsel finalizes terms AND closer to Play submission. Standing rule: must not add onboarding friction during the active seller-recruitment phase.
- **D-156** — `BusinessAvatarUploader` needs square-crop guidance + preview. Banked as MED polish, not a code bug — Kay's wide banner cropped to a circular avatar was content/shape mismatch, not upload-flow breakage. Confirmed non-issues recorded so they're not re-chased (bucket/URL/signing all correct).

**Confirmation per the directive flag:** D-155 (`fecbf54`) and D-156 (`15a87b2`) both committed this session; `git status --short` shows clean tracked-tree before this journal entry was authored.

## Legal prep

Lawyer Review Brief v0.2 written and ready for counsel next week.

- **Markdown working copy:** `docs/legal/lawyer-review-brief-v0_2.md` (untracked per never-stage rule)
- **HTML official handoff version:** `docs/legal/lawyer-review-brief-v0_2.html` (untracked) — styled to match `privacy-policy-v0.2.html`, A4 print-ready, self-contained CSS.
- **Companion:** `docs/legal/privacy-policy-v0.2.html` (pre-existing).
- **v0.1 markdown** also kept in the same folder for history.

Content: 6 sections + Executive Summary + Requested Deliverables + Preferred Timeline + Closing. OJemba liability scenario centered as Section 2 (the central question). Solo-founder calibration runs through every section. 26 triaged questions across 4 priority tiers (Priority 1 = Play-submission-blocking). Two `[INSERT DATE]` placeholders for first-response deadline and ToS-draft delivery, intentionally left for founder + counsel to agree.

Note on the directive's reference to `lawyer-review-brief-v0_1.md`: the canonical v0.2 files (`.md` + `.html`) are what was actually authored this session; v0.1 is the prior iteration. Both live in `docs/legal/`, both untracked.

## Seller / supply state (the real constraint)

- **Verified sellers: 3**
  - **Jervis_luxebrand** — Fashion, 8 active listings. First verified seller; still the catalogue anchor.
  - **Reseller By OJemba** — 0 active listings; engaged this session on the trust / hub questions that originated D-154.
  - **kay_interiors_hub** — Furniture & Home Goods. **Now posting actively** — first listings shipped this session. Avatar issue surfaced as D-156 polish item, fix is content-side (square-crop guidance) not code.
- **Car vendor onboarding** scheduled for 2026-06-01 per the D-153a interim plan (baseline /sell/verify submission, enhanced docs held out-of-band, admin approval held pending those docs to avoid briefly exposing a Tier-A seller at standard-tier verification).
- **Play readiness target:** 10 verified sellers + active-listings count to meet the Play prerequisite. **Supply is the binding constraint**, not features, not legal docs.

## Discrepancy to resolve

The lawyer brief currently states the listing prerequisite as **50** active listings; an earlier directive in this session referenced **42**. The tracker (`docs/seller-acquisition-tracker.md`) is the canonical source. To reconcile: confirm against the tracker on the next session and align the brief's text before the lawyer submission. Flagged because the lawyer should see the correct number.

## Open / Next

- **2026-06-01** — Car vendor onboarding meeting + walkthrough.
- **Out-of-band** — Message Kay re: square logo (D-156 immediate fix, no code).
- **Highest leverage** — Recruit/activate sellers toward 10/<listings-target>. Non-build work; this is the binding constraint.
- **Lawyer submission (next week)** — Fill the two `[INSERT DATE]` placeholders, attach `lawyer-review-brief-v0_2.html` + `privacy-policy-v0.2.html`, send to counsel.
- **Reconcile the 42 vs 50 listings figure** between brief and tracker; correct whichever is wrong.
- **Deferred builds** (do NOT touch this week unless the situation changes):
  - **Feature Q** — gated on at least one Tier-A seller (car vendor) completing onboarding so design can be calibrated to a real user experience.
  - **T&C / Feature T (acceptance modal)** — gated on counsel returning finalized terms.
  - **Avatar uploader crop/preview (D-156)** — next buyer-facing polish pass alongside other MED audit items.
- **Bank-worthy if pursued** — declaring `images.remotePatterns` for the Supabase host in `next.config.js`; latent hardening item, not blocking.

## Strategic significance

End of today, the platform has a closed end-to-end conversion loop, a polished public read surface, a deliberate legal-review process initiated, and four high-altitude future decisions captured before the work to implement them begins. The honest reading of the day: the product is now meaningfully ahead of supply. Code spent on Q this week or on premature acceptance modals is code not spent recruiting sellers and listening to the first Tier-A vendor. The next week's work should be supply, lawyer follow-through, and tomorrow's car vendor conversation — in that order — with code interrupting only for the polish items the audit flagged and any direct issues that real seller onboarding surfaces.
