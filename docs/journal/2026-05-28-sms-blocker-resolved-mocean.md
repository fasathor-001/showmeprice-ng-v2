# Journal — 2026-05-28 — Wave 1A.1: SMS blocker RESOLVED (Mocean) + seller-contact feature design

**Continues:** post-Stage-2.C polish work (last journal: `2026-05-22-stage-2b-db-foundation.md` — a ~6-day gap during Stage 2.B Commits 3–12 + Stage 2.C closure; not back-filled). **Commit range covered here:** through `f479f4d`.

## Headline — Wave 1A.1 launch gate cleared

**SMS launch blocker SOLVED.** Root cause confirmed: `OTP_PROVIDER_VENDOR` was set to **Arkesel**, which delivers to South Africa only — not Nigeria. Selected and integrated **Mocean** as a new OTP provider. Verified **end-to-end on live production** (`app.showmeprice.ng`): a real Nigerian MTN number (`+2348143850265`) received an OTP via Mocean and completed phone verification through the actual signup flow. This was the final Wave 1A.1 launch gate — now cleared.

## Shipped

- **`f479f4d`** — Mocean added as third OTP provider (alongside Termii + Arkesel), implementing the existing `OtpProvider` interface (D-094 abstraction holds — one env-var switch). Mocean's plain **Send SMS endpoint** (`rest/2/sms`) is used, NOT the Verify API — the app continues to own the OTP lifecycle (generate / hash / verify); the provider only delivers the rendered message. Same commit added back-nav to admin pages.
- **DB hotfix** — `phone_verifications_provider_check` constraint rejected `'mocean'`. Ran `ALTER` directly against Supabase to add `'mocean'` to the allowed values. **NOTE:** this was applied via **raw SQL, not a migration file** — a matching migration file should be added so committed schema matches the live DB. Tracked as K-067 below.
- **Dashboard label fix** — hardcoded `"WhatsApp:"` → `"Phone:"` (legacy label from when `profiles.phone` was `whatsapp_number`). Committed.

## Operational notes

- **Mocean account state:** topped up €20, on the **€0.317/SMS bridge rate** with **randomized sender**. Sender-ID (`"ShowMePrice"`) registration LOA + CAC certificate submitted to Mocean — **pending operator approval (a few weeks to ~1 month)**, which unlocks the €0.008/SMS rate and branded sender across all networks.
- **Test-account verification path confirmed:** a buyer test account was manually phone-verified via SQL (`UPDATE profiles SET verification_status`) for a friend giving feedback. Such accounts have **empty `auth_providers`** — a tell vs. OTP-verified accounts (useful as an admin filter signal).

## In-flight at session end

- **Seller-contact / WhatsApp-reveal feature** — designed, not yet built. Decisions banked this session (D-130 through D-133). **Next task is a READ-ONLY investigation:** can the existing OTP flow verify a number that is **not** the user's profile phone (the seller's separate WhatsApp), **without** granting account-level phone-verified status or overwriting `profile.phone`? Investigation result gates the build.
- **A PRIOR seller-WhatsApp attempt left uncommitted files** — `migrations/E.2.10.0-seller-whatsapp.sql` plus changes to `src/app/sell/BecomeSellerForm.tsx`, `src/app/(auth)/actions.ts`, `src/db/schema/businesses.ts`, `src/app/sell/page.tsx`, and `src/components/listings/ListingDetailsHeader.tsx`. **This attempt is REJECTED** — it stored the seller WhatsApp number **without OTP verification** (a `TODO` instead of verifying), which violates the "no unverified revealable number" rule banked in D-131. These uncommitted changes should be discarded **before** the corrected build; confirm the E.2.10.0 migration was **not** applied to production before discarding. (Local inference says not applied — `ACTUAL_SCHEMA.md` does not list `businesses.seller_whatsapp`, and the migration file is untracked — but the authoritative check is the §0 query in the migration file run against production.)

## Blockers

- **Mocean sender-ID registration pending (~weeks)** — until approved, on €0.317/SMS bridge rate with randomized sender. Fine for beta volume.
- **K-064** Paystack merchant integration pending (needed for paid reveal credits at public launch — not beta; reveal credits are free-with-limit during private beta per D-129 + D-133).
- **K-065** legal pages pending Nigerian lawyer review (pre-public-launch, not pre-beta).

## Disciplines that paid off

- **Verify-actual-state with real production end-to-end.** "Status 0" / "build complete" weren't enough — only a real Nigerian phone receiving an OTP through the live app proved the fix. Banked as a MEMORY lesson this session.
- **Provider abstraction (D-094)** earned its keep — Mocean dropped in behind the same `OtpProvider` interface; the switch is one env var. Roadmap: Arkesel needs a Nigerian account + KYB (do when back in Nigeria); Termii activates when fully launched (see D-130).

## Decisions banked this session

- **D-130** — Mocean is the active OTP provider for private beta; Termii + Arkesel remain switchable fallbacks.
- **D-131** — Seller WhatsApp required at seller setup; default to verified profile phone, OTP-verify if different; no unverified seller WhatsApp may be revealable to buyers.
- **D-132** — Messaging and contact-reveal coexist (do not replace each other) per the D-113 trust ladder.
- **D-133** — Private beta = 3 free contact reveals per buyer, lifetime, granted at phone verification, per-seller (re-revealing the same seller does not consume another). Paid reveal packs + the credit/billing system are public-launch only.

## Lessons banked this session

Four MEMORY lessons added: Cloudflare edge-runtime silent-fail; completeness signals trust in Nigerian market (refines D-125); verify production with own eyes / raw output; agent context-drift → restart fresh.

## Open questions / next-session entry point

- **Read-only investigation:** can `sendPhoneOtpAction` / `verifyPhoneOtpAction` verify a number that is not the actor's `profile.phone`, without granting account-level phone-verified status or overwriting `profile.phone`? Either the existing flow supports it (cheap path) or a parallel `seller_phone_verifications` mechanism is needed. Decide before implementing D-131.
- **Discard the rejected seller-whatsapp uncommitted files** (after confirming E.2.10.0 was not applied to production).
- **Add a migration file** for the `phone_verifications_provider_check` raw-SQL ALTER so committed schema matches live (K-067).
- **Fix the `signup_free_reveals_remaining` default**: a live test profile showed value `1` — beta default must be `3` per D-133. Find where the counter is set / backfilled and align.

## Decisions made but not yet banked

- None outstanding — D-130 through D-133 banked in `DECISIONS.md` this session.
