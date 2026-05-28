# ShowMePrice.ng v2 — Actual Database Schema (Verified)

> **This is the canonical reference.** When planning any phase, READ THIS FILE before writing spec that references database identifiers.
>
> Verified via `information_schema` and `pg_catalog` queries on 2026-05-18 during Phase E Stage 1 schema-refresh dump (D1–D6 + filter_rules follow-up). Column-level information for the 32 E.1.x CREATE-from-scratch tables derives from migration SQL whose CREATE TABLE statements all passed V-verification at apply time; the two ALTER-in-place tables (`subscriptions`, `contact_reveals`) are documented against verbatim D1 paste-back.
>
> **Phase E Stage 2 buyer-side prep applied (E.2.0.0–E.2.0.4), all V-verified:** `profiles.signup_free_reveals_remaining` + `profiles.pro_activated_at`; functions `get_buyer_reveal_cap(uuid)` + `compute_escrow_fee(bigint, uuid)`; `subscriptions.promo_code` + `subscriptions.promo_expires_at`; `credit_pack_type` enum + `payments.pack_type` + `payments_pack_type_only_for_credit_pack` CHECK. Table count unchanged at 42 (Stage 2 added only columns / functions / one enum, no new tables).
>
> **Phase E Sprint 3 seller-foundation applied (Gap A + Gap D), V-verified 2026-05-20:** `businesses.is_founding_seller` + `businesses.founding_seller_granted_at` + `businesses.grandfathered_pro_price_kobo` (D-088); `businesses.city_area` + `products.city_area` (Gap D.1); new Tier 1 `Power & Generators` parent + 4 subcategories (Gap D.0a, confirmed live via categories SELECT); `electronics.search_aliases` extended to 23 (Gap D.0b). `product_status` enum value `'sold'` now reachable via the seller mark-as-sold flow (Gap B). Table count unchanged at 42.
>
> **Phase E Stage 2.A.1 admin role provisioning applied (E.2.2.0, D-105), V-verified end-to-end 2026-05-22:** new `admin_role_changes` audit table (append-only; admin-only SELECT RLS, no write policy — written only via the functions below or service_role); SECURITY DEFINER functions `grant_admin_role(uuid, uuid, text)` + `revoke_admin_role(uuid, uuid, text)`, both triple-REVOKE'd to `service_role`; `freeze_profile_role` gained a transaction-local GUC bypass branch (`app.role_change_authorized`, set only inside those two functions). Table count now **43**.
>
> **Phase E Stage A — seller WhatsApp verification foundation applied (E.2.11.0, applied 2026-05-28 via Supabase SQL Editor as `postgres` after `RESET ROLE`, file written same day):** `phone_verifications.purpose` column (text, NOT NULL, default `'profile_phone'`, CHECK in `{'profile_phone','seller_whatsapp'}`) + new partial index `phone_verifications_user_purpose_unconsumed_idx` on `(user_id, purpose, created_at DESC) WHERE consumed_at IS NULL`; `businesses.seller_whatsapp` (text, nullable, CHECK NULL-or-`^234\d{10}$`) + `businesses.seller_whatsapp_verified_at` (timestamptz, nullable); new SECURITY DEFINER function `mark_seller_whatsapp_verified(p_verification_id uuid, p_user_id uuid)`, triple-REVOKE'd to `service_role` only (verified live: ACL `{postgres=X/postgres, service_role=X/postgres}`). The existing OTP flow is unchanged (`mark_phone_verified` continues to own `purpose='profile_phone'` rows). Application logic (Stage B) ships separately. Table count unchanged at **43**.
>
> If you change the schema (new tables, new columns, new policies, new triggers, new enums), update this file in the same commit.

---

## Tables (`public` schema)

**44 tables total** (verified 2026-05-22), **all with RLS enabled.** Of these, **29 have RLS policies deployed** and **15 are RLS-enabled with zero policies** — the latter are deferred/empty feature tables (and service-role-only tables like `phone_verifications`) that are secure-by-default until their feature ships. The 15 zero-policy tables: `delivery_partners`, `escrow_transactions`, `institution_accounts`, `kyc_documents`, `message_image_analysis`, `message_reactions`, `orders`, `order_status_history`, `phone_verifications`, `push_subscriptions`, `restricted_categories`, `saved_searches`, `seller_auto_reply`, `shipping_addresses`, `shipping_quotes`.

> **Drift correction (2026-05-22):** an earlier note here claimed "Phase E.1.x RLS to be added in E.1.4 (pending)." That was stale — RLS policies ARE deployed across the E.1.x tables. Policy bodies are documented below for Phase A/C.5 tables + `conversations`/`messages`; the remaining ~19 policied tables' bodies are tracked for transcription in K-028.

Per D-081, `admin_audit_log` (Phase A) was dropped in micro-migration E.1.3.1. `admin_action_log` (E.1.2) is the canonical admin moderation audit table.

### `admin_action_log`

Phase E moderation audit log. Replaces Phase A's `admin_audit_log` (dropped E.1.3.1, D-081). Structured target reference + case clustering for Phase F+ case management.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| admin_id | uuid → admins(id) | NO | — |
| target_type | text | NO | — (`'listing'`, `'user'`, `'message'`, `'report'`, `'verification'`, `'subscription'`) |
| target_id | uuid | NO | — |
| action | text | NO | — (`'dismiss_report'`, `'warn_user'`, `'hide_listing'`, `'suspend_user'`, `'ban_user'`, `'verify_seller'`, `'reject_verification'`, `'refund'`, `'email_sent'`, etc.) |
| reason | text | YES | — |
| notes | text | YES | — (admin's free-form notes) |
| metadata | jsonb | YES | — |
| case_id | uuid | YES | — (Phase F+ case clustering) |
| created_at | timestamptz | NO | now() |

**Indexes:**
- `admin_action_log_admin_idx` btree on (admin_id, created_at)
- `admin_action_log_target_idx` btree on (target_type, target_id)

### `admin_emails`

Outbound email log for admin-to-user communications. Phase E ships email channel only; Phase F+ extends to in-app / SMS.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| admin_id | uuid → admins(id) | YES | — |
| recipient_user_id | uuid → profiles(id) SET NULL | YES | — |
| channel | text | NO | `'email'` |
| subject | text | NO | — |
| body | text | NO | — |
| case_id | uuid | YES | — |
| sent_at | timestamptz | NO | now() |

**Indexes:**
- `admin_emails_recipient_idx` btree on (recipient_user_id, sent_at)

### `admin_role_changes`

Append-only audit of admin role grants/revokes (Phase E Stage 2.A.1 / E.2.2.0 / D-105). Written ONLY by the SECURITY DEFINER functions `grant_admin_role` / `revoke_admin_role` (owner-run, RLS-bypassing) or service_role — there is no API-level INSERT/UPDATE/DELETE policy. RLS enabled with an admin-only SELECT policy.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| target_user_id | uuid → profiles(id) RESTRICT | NO | — |
| granter_id | uuid → profiles(id) SET NULL | YES | — (NULL for bootstrap — no granter) |
| action | text | NO | — (CHECK `IN ('granted', 'revoked', 'bootstrap')`) |
| reason | text | YES | — |
| created_at | timestamptz | NO | now() |

**Constraints:**
- `admin_role_changes_target_user_id_profiles_id_fk` (→ profiles, ON DELETE RESTRICT)
- `admin_role_changes_granter_id_profiles_id_fk` (→ profiles, ON DELETE SET NULL)
- `admin_role_changes_action_check` CHECK (action IN ('granted', 'revoked', 'bootstrap'))

**Indexes:**
- `admin_role_changes_target_user_id_idx` btree on (target_user_id)
- `admin_role_changes_granter_id_idx` btree on (granter_id)
- `admin_role_changes_created_at_idx` btree on (created_at DESC)

**Notes:**
- `action='bootstrap'` = first admin auto-granted on `ADMIN_BOOTSTRAP_EMAIL` match (`granter_id` NULL, service_role-trusted path). `'granted'`/`'revoked'` = delegated by an existing active admin (`granter_id` set).
- Drizzle mirror at `src/db/schema/admin_role_changes.ts` (the CHECK lives in SQL only, per mirror convention).

### `admins`

Separated admin entity (Phase E §14 / D-078). Distinct from `profiles.role = 'admin'`. Phase E ships single role `super_admin`; Phase F+ adds moderator/support/finance/verifier.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| email | text | NO | — (UNIQUE) |
| full_name | text | NO | — |
| admin_role | text | NO | `'super_admin'` |
| active | boolean | NO | true |
| created_at | timestamptz | NO | now() |
| last_login_at | timestamptz | YES | — |

**Notes:**
- `admins` and `profiles.role = 'admin'` coexist during Phase E. The `is_admin(auth.uid())` function still checks `profiles.role = 'admin'` for RLS. Full unification deferred to Phase F+ (per D-081).
- Referenced as FK target by `admin_action_log.admin_id`, `admin_emails.admin_id`, `institution_accounts.account_manager_id`.

### `blocks`

User-to-user blocks (buyer ↔ seller). Self-serve from blocker's profile settings.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| blocker_id | uuid → profiles(id) CASCADE | NO | — |
| blocked_id | uuid → profiles(id) CASCADE | NO | — |
| case_id | uuid | YES | — |
| created_at | timestamptz | NO | now() |

**Constraints:**
- UNIQUE (blocker_id, blocked_id) — one block row per directed pair
- CHECK (blocker_id <> blocked_id) — `blocks_no_self`

**Indexes:**
- `blocks_blocked_count_idx` btree on (blocked_id) — fast aggregate "how many people blocked this user" for admin fraud-pattern dashboard

### `businesses`

A seller's business profile. One per user (no FK uniqueness constraint enforces this, but business logic does).

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| owner_id | uuid → profiles(id) CASCADE | NO | — |
| **business_name** | text | NO | — |
| slug | text | YES | — |
| description | text | YES | — |
| state_id | uuid → nigerian_states(id) SET NULL | YES | — |
| logo_path | text | YES | — |
| **verification_status** | verification_status (enum) | NO | `'unsubmitted'` |
| rejection_reason | text | YES | — |
| is_disabled | boolean | NO | false |
| **seller_tier** | text | NO | `'free'` (Phase E.1.0; backfilled to `'verified'` for businesses where `verification_status='verified'`) |
| **seller_listing_limit** | integer | YES | — (Phase E.1.0; null = unlimited. Phase F+ enforces per-tier limits) |
| **seller_reply_quota** | integer | YES | — (Phase E.1.0; null = unlimited. Phase F+ enforces per-tier reply quotas) |
| **city_area** | text | YES | — (Sprint 3 / Gap D.1; business operating location, optional/unenforced) |
| **is_founding_seller** | boolean | NO | false (Sprint 3 / D-088; grant happens at Phase F launch, not Phase E) |
| **founding_seller_granted_at** | timestamptz | YES | — (Sprint 3 / D-088) |
| **grandfathered_pro_price_kobo** | integer | YES | — (Sprint 3 / D-088; `750000` = ₦7,500 for Founding Sellers, NULL otherwise) |
| **seller_whatsapp** | text | YES | — (E.2.11.0; canonical NG E.164 w/o `+`, e.g. `2348012345678`. NULL = seller chose "use my verified profile phone" — fallback at reveal time is `profile.phone`. CHECK enforces NULL-or-`^234\d{10}$`. Written ONLY by `mark_seller_whatsapp_verified` RPC paired with `seller_whatsapp_verified_at` — never via direct application UPDATE) |
| **seller_whatsapp_verified_at** | timestamptz | YES | — (E.2.11.0; non-null = the current `seller_whatsapp` value was OTP-proven at this timestamp. NULL = unverified or no alternate number set. Timestamp is both flag and audit) |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

**Notes:**
- Column is `business_name`, NOT `name`. Default for `verification_status` was changed from `'pending'` to `'unsubmitted'` during Phase C.5 P.1.
- `seller_tier` (Phase E.1.0) tracks the seller's tier — `'free'`, `'verified'` (post-identity-verification, baseline), with Phase F+ adding `'pro_seller'`/`'premium_seller'` and Phase G+ adding `'enterprise_seller'`. Distinct from the buyer-side `profiles.tier`.
- `seller_listing_limit` / `seller_reply_quota` are nullable and unenforced in Phase E (tracking-only schema). Phase F+ enforces per-tier ceilings.
- Founding Seller fields (`is_founding_seller`/`founding_seller_granted_at`/`grandfathered_pro_price_kobo`) are schema-only in Phase E per D-088. Grants run at Phase F launch (admin script selecting the first 100 sellers by `seller_verifications.reviewed_at ASC`). Badge renders on the not-yet-built public storefront (Phase F+ platform gap, see MEMORY.md).
- `city_area` (Sprint 3 / Gap D) is optional and unenforced for businesses (contrast `products.city_area`, which is app-required on create/edit). Legacy rows are NULL.
- `seller_whatsapp` / `seller_whatsapp_verified_at` (E.2.11.0): the verified-alternate-number pair for buyer contact reveal. NULL `seller_whatsapp` is the common case — sellers default to their verified `profiles.phone`. When set, the value was proven controlled via inline SMS OTP at signup (purpose=`'seller_whatsapp'` row consumed by `mark_seller_whatsapp_verified`). Application Stage B (server actions + form UI) is the next commit.

### `categories`

Top-level + sub-categories. Post-Sprint-3: 29 top-level (7 Tier 1 + 11 Tier 2 + 11 Tier 3) + 79 sub-categories = 108 rows total. See "Complete category taxonomy" section below for the inventory.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO | — |
| slug | text | NO | — (UNIQUE) |
| parent_id | uuid → categories(id) RESTRICT | YES | — |
| sort_order | integer | NO | 0 |
| icon_name | text | YES | — |
| **tier** | integer | NO | 3 (Phase D.1) |
| **search_aliases** | jsonb | NO | `'[]'::jsonb` (Phase D.7.2) |
| **category_features** | jsonb | NO | `'{}'::jsonb` (Phase E.1.0; per-category feature flags — warning banners, high-value flags, required-field hints) |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

**Notes:**
- `tier` (added Phase D.1) classifies top-level parents: 1 = home-page featured, 2 = `/categories` index standard, 3 = "Other categories" disclosure drawer. Subcategories carry the default value 3 — tier is semantically meaningful for top-level rows only.
- `search_aliases` (added Phase D.7.2) is a JSONB array of lowercased buyer-intent terms. Per D-049/D-050, contains category-level synonyms only.
- `electronics` carries the most aliases (23 in production after Gap D's appliance-routing additions, verified via `jsonb_array_length`). Seed.ts has 28 — a documented 5-alias seed-vs-prod drift tracked by the Phase E Taxonomy Reconciliation task, not a bug.
- `icon_name` is vestigial post-D.4.1 — `getCategoryEmoji()` keys on `slug` instead. New rows leave it NULL.

### `contact_reveals`

Records when buyers reveal seller WhatsApp contact. Reshaped in Phase E.1.1 (D-055) — Phase A columns `channel`, `ip_hash`, `created_at` dropped; new Phase E columns added.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| buyer_id | uuid → profiles(id) CASCADE | NO | — |
| listing_id | uuid → products(id) CASCADE | NO | — (column renamed from `product_id` in E.1.1) |
| seller_id | uuid → profiles(id) CASCADE | NO | — |
| revealed_at | timestamptz | NO | now() |
| credit_used | boolean | NO | false (true = consumed a credit pack credit; false = via active subscription) |
| payment_id | uuid → payments(id) | YES | — (links to the credit-pack purchase that funded the reveal, if applicable) |

**Notes:**
- 7 columns logical order. Ordinal positions 5/6/7 are gaps from the Phase A DROP COLUMN of `channel`/`ip_hash`/`created_at` in E.1.1 (standard Postgres behavior — DROP doesn't renumber subsequent columns). Always document in logical order, never reference `ordinal_position` from a tool query.
- FK constraint name for the `listing_id` column was renamed in D-080.1 (2026-05-20): `contact_reveals_product_id_products_id_fk` → `contact_reveals_listing_id_products_id_fk` (RENAME CONSTRAINT, CASCADE preserved). The `buyer_id`/`seller_id` FK names (`contact_reveals_buyer_id_profiles_id_fk`, `contact_reveals_seller_id_profiles_id_fk`) are truthful Drizzle-canonical names — left untouched.

### `conversations`

WhatsApp-style chat between a buyer and a seller about a specific listing. One conversation per (buyer, seller, listing) for the canonical buyer↔seller flow; partial unique index allows future conversation types (`'admin_user'`, `'seller_buyer_fulfillment'`) without buyer/seller/listing dedup.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| buyer_id | uuid → profiles(id) RESTRICT | NO | — |
| seller_id | uuid → profiles(id) RESTRICT | NO | — |
| listing_id | uuid → products(id) RESTRICT | NO | — |
| conversation_type | text | NO | `'buyer_seller'` |
| status | text | **NO** | `'active'` |
| last_message_at | timestamptz | YES | — |
| last_message_type | text | YES | — |
| created_at | timestamptz | NO | now() |

**Constraints (verified 2026-05-22):**
- `conversations_status_check` CHECK (`status IN ('active','archived','listing_sold','listing_deleted')`)
- FKs use Postgres-default `_fkey` names (raw-SQL created), all **ON DELETE RESTRICT**: `conversations_buyer_id_fkey`, `conversations_seller_id_fkey`, `conversations_listing_id_fkey`.

**Indexes (verified 2026-05-22):**
- `conversations_buyer_seller_listing_unique` partial UNIQUE on (buyer_id, seller_id, listing_id) WHERE conversation_type = 'buyer_seller'
- `conversations_buyer_idx` btree on (buyer_id, last_message_at DESC)
- `conversations_seller_idx` btree on (seller_id, last_message_at DESC)
- `conversations_listing_idx` btree on (listing_id)

**RLS:** enabled, 4 policies (admin_all / buyer_insert / party_read / party_update) — see RLS Policies section.

**Realtime:** in the `supabase_realtime` publication with **REPLICA IDENTITY FULL** — verified live 2026-05-22. (Both were already in this end state before the planned E.2.4.0 migration ran — §1's first `ALTER PUBLICATION ADD TABLE` errored 42710 "already member" and rolled back, so no migration file was shipped. Earlier Phase 1 query 10 + the E.2.4.0 §0a both reported 0 publication rows; the post-rollback re-query showed both tables present + FULL. Provenance unclear — see K-030.)

### `credit_balances`

One row per buyer — current credit balance + expiry tracking for credit packs (6-month expiry on credits).

| Column | Type | Nullable | Default |
|---|---|---|---|
| user_id | uuid → profiles(id) | NO | — (PRIMARY KEY — one row per user) |
| credits_available | integer | YES | 0 |
| credits_purchased_at | timestamptz | YES | — |
| credits_expire_at | timestamptz | YES | — |
| updated_at | timestamptz | YES | now() |

### `delivery_partners`

Empty in Phase E; Phase G+ populates for logistics integrations.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO | — |
| type | text | YES | — (`'logistics'`, `'rider_network'`, `'self_pickup'`) |
| coverage_states | uuid[] | YES | — (state_ids covered) |
| base_rate_kobo | bigint | YES | — |
| api_credentials | jsonb | YES | — |
| active | boolean | NO | true |

### `escrow_orders`

**[LEGACY — Phase A, retained per D-059; Phase G+ migration path documented in D-072.]**

Phase A's escrow placeholder. Phase E ships canonical fulfillment via `orders` + `escrow_transactions` (both empty in Phase E). `escrow_orders` is preserved unchanged through Phase E; data migration / drop happens in Phase G+ alongside the actual escrow rollout.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| product_id | uuid → products(id) RESTRICT | NO | — |
| buyer_id | uuid → profiles(id) RESTRICT | NO | — |
| seller_id | uuid → profiles(id) RESTRICT | NO | — |
| amount_kobo | bigint | NO | — |
| currency | currency (enum) | NO | `'NGN'` |
| status | escrow_order_status (enum) | NO | `'initiated'` |
| paystack_transaction_reference | text | YES | — |
| shipping_note | text | YES | — |
| dispute_reason | text | YES | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

### `escrow_transactions`

Empty in Phase E; Phase G+ populates with hold/release/refund records. Forms circular FK with `orders` (`orders.escrow_id` ↔ `escrow_transactions.order_id`).

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| order_id | uuid → orders(id) RESTRICT | NO | — |
| buyer_id | uuid → profiles(id) RESTRICT | NO | — |
| seller_id | uuid → profiles(id) RESTRICT | NO | — |
| amount_kobo | bigint | YES | — |
| payment_provider | text | YES | — (`'paystack'`; D-074 deprioritized Monnify; values added if a Phase F+ alternative ships) |
| provider_reference | text | YES | — |
| status | text | YES | — (`'held'`, `'released'`, `'refunded'`, `'disputed'`) |
| held_at | timestamptz | YES | — |
| released_at | timestamptz | YES | — |
| refunded_at | timestamptz | YES | — |

### `filter_actions_log`

Records every PII-filter action: warning shown, block triggered, user-proceeded-anyway. Drives admin rule-tuning + filter effectiveness review.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid → profiles(id) SET NULL | YES | — |
| context | text | YES | — (`'message'`, `'listing_description'`) |
| context_id | uuid | YES | — (message_id or product_id) |
| rule_id | uuid | YES | — (FK to filter_rules added in E.1.5; currently unconstrained UUID per E.1.2 design note) |
| rule_action | text | YES | — (what the rule did) |
| original_content | text | YES | — |
| user_proceeded | boolean | YES | — (did they send anyway after soft warning) |
| created_at | timestamptz | NO | now() |

**Indexes:**
- `filter_actions_log_user_idx` btree on (user_id, created_at)
- `filter_actions_log_rule_idx` btree on (rule_id)

### `filter_rules`

Admin-editable PII filter rules. Seeded with initial Nigerian-tuned ruleset in E.1.5.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| rule_type | text | NO | — (`'phone'`, `'whatsapp_link'`, `'bank_account'`, etc.) |
| pattern | text | NO | — (regex) |
| action | text | NO | — (CHECK `IN ('block', 'warn', 'allow')`) |
| applies_to_tier | text[] | YES | — (`{free}` for soft-warn-then-allow on free; `{free,pro}` for universal blocks) |
| applies_to_context | text[] | YES | — (`{message,listing_description}`; query with `'message' = ANY(applies_to_context)`) |
| description | text | YES | — |
| active | boolean | YES | true |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

**Constraints:**
- `filter_rules_action_check` CHECK (action IN ('block', 'warn', 'allow'))
- No UNIQUE constraint — intentional, allows multiple rules per (rule_type, pattern) combo for different contexts/tiers.

**Indexes:**
- `filter_rules_active_idx` btree on (active, rule_type) — for active-rules lookup pattern

**Notes:**
- `applies_to_context` / `applies_to_tier` are **`text[]`** (NOT jsonb). A 2026-05-22 doc edit briefly mis-recorded these as `jsonb` (inferred from Supabase's JSON-like CSV rendering of `text[]`-of-strings); reverted here — the original `text[]` was correct, and `information_schema` (`data_type='ARRAY'`, `udt_name='_text'`) is authoritative. Query containment with `'message' = ANY(applies_to_context)`, not `@>`.
- **E.2.3.0 reconciliation (D-110 Interpretation C, 2026-05-22):** `email` + `nuban` were split per-context — `block` for `listing_description` (tier `{free,pro}`), `warn` for `message` (tier `{free}`, Pro-exempt). Off-platform-handoff patterns (whatsapp/signal/telegram/payment_url/shortened_url) remain hard `block` in messages; listings unchanged.
- **E.2.6.0 expansion (D-119, 2026-05-23):** NUBAN flipped from `warn` to `block` in message context (tier `{free}` preserved — Pro relaxation). K-029 price-context whitelist in `src/lib/messaging/filters.ts` extended to apply to block-tier so legitimate ₦1B+ prices don't get hard-blocked. **9 new rows inserted**, all message-context only (listing-context deferred to K-036): `phone_ng` block (Nigerian sep-tolerant phone, tier `{free,pro}`); `whatsapp_link` typo variants block (`we.me`, `w-a.me`, `whatsap.me`, `whatsap.com`, tier `{free,pro}`); `payment_url` extension block (paystack/flutterwave/flw/monnify/opay/paypal, tier `{free,pro}`); `shortened_url` extension block (bit.ly/cutt.ly/rebrand.ly/etc., tier `{free,pro}`); `telegram_link` block for `telegram.org/?` (tier `{free,pro}` — pre-existing `t.me\|telegram.me` rule preserved); new `telegram_ref` rule_type block for textual references (tier `{free,pro}`); new `off_platform_handoff` rule_type warn — 2 patterns (handoff language + "lets talk privately/outside", tier `{free}`); new `bank_platform_ref` rule_type warn (Nigerian bank brand names, tier `{free}`). `signal_link` extension was rejected during §0 paste-back — production already covers `signal.me` + `signal.org`.

### `institution_accounts`

Empty in Phase E; Phase G+ populates for B2B / enterprise relationships.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO | — |
| industry | text | YES | — |
| primary_contact_id | uuid → profiles(id) SET NULL | YES | — |
| account_manager_id | uuid → admins(id) SET NULL | YES | — |
| custom_terms | jsonb | YES | — |
| created_at | timestamptz | NO | now() |

### `kyc_documents`

**[Empty in Phase E; schema deliberately under-specified per D-075.]** Phase H+ enhanced verification (NIN, BVN, etc.). Stage 2 NIN integration may ALTER this table with additional columns based on Korapay Identity response shape; current minimal columns are provisional.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid → profiles(id) CASCADE | NO | — |
| document_type | text | YES | — (Stage 2 limits to `'nin'`; Phase F+ adds `'bvn'`) |
| document_reference | text | YES | — |
| verification_status | text | YES | — |
| verified_at | timestamptz | YES | — |
| created_at | timestamptz | NO | now() |

### `message_image_analysis`

Empty in Phase E; Phase G+ populates for OCR analysis of message attachments.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| message_id | uuid → messages(id) CASCADE | NO | — |
| ocr_text | text | YES | — |
| detected_phone_numbers | text[] | YES | — |
| detected_bank_accounts | text[] | YES | — |
| analysis_status | text | YES | — |
| analyzed_at | timestamptz | YES | — |

### `message_reactions`

Empty in Phase E; Phase F+ ships emoji reactions on messages.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| message_id | uuid → messages(id) CASCADE | NO | — |
| user_id | uuid → profiles(id) CASCADE | NO | — |
| reaction | text | NO | — (`'thumbs_up'`, `'thumbs_down'`, etc. — open taxonomy, Phase F+ locks it) |
| created_at | timestamptz | NO | now() |

**Constraints:**
- UNIQUE (message_id, user_id, reaction)

### `messages`

In-conversation messages. Phase E ships `text` and `image` message types; Phase F+ adds `voice_note`, `offer`, `system`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| conversation_id | uuid → conversations(id) CASCADE | NO | — |
| sender_id | uuid → profiles(id) RESTRICT | NO | — |
| message_type | text | NO | `'text'` |
| content | text | YES | — |
| metadata | jsonb | **NO** | `'{}'` |
| attachment_url | text | YES | — (Supabase Storage URL for images) |
| read_at | timestamptz | YES | — (null until recipient reads) |
| created_at | timestamptz | NO | now() |

**Constraints (verified 2026-05-22):**
- `messages_message_type_check` CHECK (`message_type IN ('text','image','voice_note','offer','system')`) — note `'offer'` is already allowed, so D-099 basic offers (`message_type='offer'` + amount in `metadata`) need NO schema change.
- FKs (Postgres-default `_fkey` names): `messages_conversation_id_fkey` **ON DELETE CASCADE** (deleting a conversation removes its messages); `messages_sender_id_fkey` **ON DELETE RESTRICT**.

**Indexes (verified 2026-05-22):**
- `messages_conversation_idx` btree on (conversation_id, created_at)
- `messages_unread_idx` partial btree on (conversation_id) WHERE `read_at IS NULL` — fast unread-count lookups.

**RLS:** enabled, 4 policies (admin_all / party_read / party_update / sender_insert) — see RLS Policies section.

**Realtime:** in the `supabase_realtime` publication with **REPLICA IDENTITY FULL** — verified live 2026-05-22. (Both were already in this end state before the planned E.2.4.0 migration ran — §1's first `ALTER PUBLICATION ADD TABLE` errored 42710 "already member" and rolled back, so no migration file was shipped. Earlier Phase 1 query 10 + the E.2.4.0 §0a both reported 0 publication rows; the post-rollback re-query showed both tables present + FULL. Provenance unclear — see K-030.)

### `nigerian_states`

37 states + FCT, seeded in Phase A.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO | — (UNIQUE) |
| **slug** | text | NO | — (UNIQUE; Phase D.1) |
| iso_code | text | NO | — (UNIQUE) |
| created_at | timestamptz | NO | now() |

**Notes:**
- `slug` (added Phase D.1) is the URL-friendly identifier used throughout the app — `?state=lagos`, `?state=akwa-ibom`. Explicit overrides for FCT → `abuja`, `Akwa Ibom` → `akwa-ibom`, `Cross River` → `cross-river`.
- `FEATURED_STATE_SLUGS` (in `src/lib/states.ts`) defines the 9 featured states for dropdown ordering and dynamic chip ranking.

### `notification_log`

Per-event delivery record. One row per channel per event (a single `new_message` notification can have one in_app + one email + one sms row).

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid → profiles(id) | YES | — |
| event_type | notification_event (enum) | YES | — |
| channel | text | YES | — (`'in_app'`, `'email'`, `'sms'`, `'push'`) |
| subject | text | YES | — |
| body | text | YES | — |
| sent_at | timestamptz | YES | now() |
| delivered_at | timestamptz | YES | — |
| read_at | timestamptz | YES | — |
| provider_reference | text | YES | — (Termii message ID, email provider ID, etc.) |

### `notification_preferences`

Per-user per-event opt-in/opt-out across channels. Seeded with sensible defaults at signup (in_app + email enabled for everything; SMS only for Pro buyers; push disabled until Phase F+).

| Column | Type | Nullable | Default |
|---|---|---|---|
| user_id | uuid → profiles(id) | NO | — |
| event_type | notification_event (enum) | NO | — |
| in_app_enabled | boolean | YES | true |
| email_enabled | boolean | YES | true |
| sms_enabled | boolean | YES | false |
| push_enabled | boolean | YES | false |

**Constraints:**
- PRIMARY KEY (user_id, event_type)

### `order_status_history`

Empty in Phase E; Phase G+ logs every order status transition.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| order_id | uuid → orders(id) CASCADE | NO | — |
| from_status | text | YES | — |
| to_status | text | YES | — |
| changed_by | uuid → profiles(id) SET NULL | YES | — |
| reason | text | YES | — |
| changed_at | timestamptz | NO | now() |

### `orders`

Empty in Phase E; Phase G+ canonical fulfillment table (supersedes `escrow_orders`, see D-072). Forms circular FK with `escrow_transactions`.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| buyer_id | uuid → profiles(id) RESTRICT | NO | — |
| seller_id | uuid → profiles(id) RESTRICT | NO | — |
| listing_id | uuid → products(id) SET NULL | YES | — |
| conversation_id | uuid → conversations(id) SET NULL | YES | — |
| status | text | YES | — (`'pending'`, `'paid'`, `'shipped'`, `'delivered'`, `'completed'`, `'disputed'`, `'refunded'`) |
| amount_kobo | bigint | YES | — |
| escrow_id | uuid → escrow_transactions(id) SET NULL | YES | — |
| shipping_address_id | uuid → shipping_addresses(id) SET NULL | YES | — |
| delivery_partner_id | uuid → delivery_partners(id) SET NULL | YES | — |
| created_at | timestamptz | NO | now() |
| paid_at | timestamptz | YES | — |
| shipped_at | timestamptz | YES | — |
| delivered_at | timestamptz | YES | — |
| completed_at | timestamptz | YES | — |

### `payments`

Provider-agnostic payment record. Phase E populates via Paystack only (D-074). Phase F+ may add Flutterwave behind the same `PaymentGateway` interface (D-078). Monnify was on the original Phase G+ escrow shortlist but was deprioritized per D-074 — Paystack covers Phase E escrow per D-082.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid → profiles(id) | YES | — |
| payment_provider | text | NO | `'paystack'` |
| provider_transaction_id | text | YES | — (Paystack reference, etc.) |
| amount_kobo | bigint | NO | — |
| currency | text | NO | `'NGN'` |
| payment_type | text | NO | — (`'credit_pack'`, `'subscription_initial'`, `'subscription_renewal'`, `'refund'`) |
| status | text | NO | — (`'pending'`, `'success'`, `'failed'`, `'refunded'`) |
| metadata | jsonb | YES | — |
| created_at | timestamptz | YES | now() |
| completed_at | timestamptz | YES | — |
| **pack_type** | credit_pack_type (enum) | YES | — (Phase E.2.0.4 / D-085; `'trial'`/`'small'`/`'medium'`/`'large'`. Meaningful only for `payment_type='credit_pack'` rows) |

**Constraints:**
- `payments_pack_type_only_for_credit_pack` CHECK (`pack_type IS NULL OR payment_type = 'credit_pack'`) — Phase E.2.0.4. Prevents non-credit-pack payments (subscriptions, refunds) from carrying a pack_type.

**Notes:**
- `pack_type` enum (E.2.0.4): closed set of 4 values matching D-085 locked credit pack structure (Trial ₦500/1 reveal, Small ₦1,500/3, Medium ₦3,500/9, Large ₦7,000/20). Enum (not text) because the value set is fixed — unlike `payment_type`/`status`/`tier`/`plan_code` which are text for extensibility.
- Credit balance accumulation happens on `credit_balances` (running balance only); `payments.pack_type` records which pack was purchased for analytics + reconciliation.

### `payment_detail_shares`

Phase E Stage 2.B Commit 1.6 / D-120 (migration **E.2.7.0**, verified live 2026-05-23). Per-conversation, per-buyer payment-details share events. Created when the seller clicks "Share payment details" in a conversation; the active share for a conversation has `superseded_at IS NULL`. Re-share (after seller updates `seller_payout_accounts`) creates a new row + sets `superseded_at` on the old one.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| conversation_id | uuid → conversations(id) CASCADE | NO | — |
| seller_id | uuid → profiles(id) CASCADE | NO | — |
| buyer_id | uuid → profiles(id) CASCADE | NO | — |
| account_snapshot | jsonb | NO | — (`{bank_name, account_name, account_number_encrypted}` — ciphertext copied verbatim from `seller_payout_accounts` at share time; no decrypt/re-encrypt cycle, snapshots stay encrypted at rest) |
| shared_at | timestamptz | NO | now() |
| buyer_viewed_at | timestamptz | YES | — (set by `markPaymentDetailsViewed`) |
| buyer_warning_accepted_at | timestamptz | YES | — (set by `acceptPaymentDetailsWarning`) |
| superseded_at | timestamptz | YES | — (set on the OLD row when seller re-shares; NULL on the active row) |
| created_at | timestamptz | NO | now() |

**Constraints:**
- `payment_detail_shares_snapshot_shape` CHECK — `account_snapshot` is a jsonb object with the three required keys.
- FKs: `payment_detail_shares_conversation_id_fkey` (CASCADE), `_seller_id_fkey` (CASCADE), `_buyer_id_fkey` (CASCADE).

**Indexes:**
- `payment_detail_shares_active_per_conversation_idx` btree on `(conversation_id) WHERE superseded_at IS NULL` — drives `getPaymentDetailsForConversation`.
- `payment_detail_shares_buyer_idx` btree on `(buyer_id)`.
- `payment_detail_shares_seller_idx` btree on `(seller_id)`.

**RLS (5 policies — verified 2026-05-23):**
- `payment_detail_shares_seller_select` (SELECT): `seller_id = auth.uid()`
- `payment_detail_shares_buyer_select` (SELECT): `buyer_id = auth.uid()`
- `payment_detail_shares_seller_insert` (INSERT): WITH CHECK `seller_id = auth.uid()`
- `payment_detail_shares_buyer_update` (UPDATE): USING + CHECK `buyer_id = auth.uid()` (for viewed_at / warning_accepted_at)
- `payment_detail_shares_seller_update` (UPDATE): USING + CHECK `seller_id = auth.uid()` (for re-share supersession)

### `phone_verifications`

Phase E Stage 2.A (E.2.1.0 — table; E.2.1.1 — `provider` column). Backs the phone OTP flow (`sendPhoneOtpAction` / `verifyPhoneOtpAction`). We own the OTP lifecycle — the SMS provider (Termii/Arkesel) only delivers a rendered message. Reference commits: `f302483` (table), `13bf8d4` (`provider` column + `mark_phone_verified` + lockdown fix).

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid → profiles(id) CASCADE | NO | — |
| phone | text | NO | — (canonical NG E.164 w/o `+`, e.g. `2348012345678`) |
| code_hash | text | NO | — (SHA-256 of `salt:phone:code`; plaintext code never stored) |
| channel | text | NO | `'sms'` (CHECK in `'sms'`/`'whatsapp'`) |
| request_ip_hash | text | YES | — (SHA-256 of `salt:rawIp`; salted hash, never raw IP — NDPR) |
| expires_at | timestamptz | NO | — (10-minute TTL set by the action) |
| attempts_made | integer | NO | 0 (CHECK ≥ 0; capped at 5 in the verify action) |
| consumed_at | timestamptz | YES | — (set on successful verify or invalidation) |
| created_at | timestamptz | NO | now() |
| **provider** | text | NO | — (CHECK in `'termii'`/`'arkesel'`; sending vendor, set from `getOtpProvider().vendor`. Live DB also accepts `'mocean'` via raw ALTER — see K-067) |
| **purpose** | text | NO | `'profile_phone'` (E.2.11.0; CHECK in `'profile_phone'`/`'seller_whatsapp'`. Existing rows backfilled to `'profile_phone'` via the NOT NULL DEFAULT. Discriminates which RPC may consume the row: `mark_phone_verified` owns `'profile_phone'`, `mark_seller_whatsapp_verified` owns `'seller_whatsapp'`) |

**Constraints:** PK; `phone_verifications_user_id_profiles_id_fk` (→ profiles, ON DELETE CASCADE); `phone_verifications_channel_check`; `phone_verifications_attempts_nonneg_check`; `phone_verifications_provider_check`; `phone_verifications_purpose_check` (E.2.11.0).

**Indexes:** PK + `phone_verifications_phone_created_idx` (per-phone rate limit, 3/hr) + `phone_verifications_request_ip_hash_created_idx` (per-IP rate limit, 10/hr) + `phone_verifications_user_created_idx` (newest-unconsumed verify lookup) + `phone_verifications_user_purpose_unconsumed_idx` (E.2.11.0; partial on `consumed_at IS NULL`, supports the new `(user_id, purpose)` verify-path lookup for seller-WhatsApp without disturbing the profile-phone path).

**Access model:** RLS **enabled with ZERO policies** — never read/written by the browser. All access is via the service-role client (`createAdminClient`) inside server actions, keeping `code_hash` + `attempts_made` entirely server-side. The final verify-success write goes through `mark_phone_verified` (below), not a direct table write.

### `price_history`

Append-only price-change log on `products`. Written by AFTER UPDATE OF `price_kobo` trigger (`products_price_change_log` → `log_product_price_change` function). Phase E logs; Phase F+ surfaces (price drop alerts).

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| product_id | uuid → products(id) CASCADE | NO | — |
| price_kobo | bigint | NO | — |
| changed_at | timestamptz | NO | now() |
| changed_by | uuid → profiles(id) SET NULL | YES | — |

**Indexes:**
- `price_history_product_idx` btree on (product_id, changed_at DESC) — fast "latest N price changes for this product"

**Trigger source:** `products_price_change_log` (AFTER UPDATE OF price_kobo) — writes one row per actual price change. Per D-071, `changed_by` is populated from `NEW.seller_id` (best-effort attribution; admin overrides captured separately in `admin_action_log`).

### `product_images`

Image references for product listings. Stored as `storage_path` strings pointing at Supabase Storage.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| product_id | uuid → products(id) CASCADE | NO | — |
| **storage_path** | text | NO | — |
| **position** | integer | NO | 0 |
| alt_text | text | YES | — |
| created_at | timestamptz | NO | now() |

**Notes:** Columns are `storage_path` (NOT `url`) and `position` (NOT `sort_order`). **There is NO `is_primary` column** — the image at `position = 0` is the primary.

### `products`

Marketplace listings.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| business_id | uuid → businesses(id) CASCADE | NO | — |
| seller_id | uuid → profiles(id) CASCADE | NO | — |
| **slug** | text | NO | — (REQUIRED; no default) |
| title | text | NO | — |
| description | text | NO | — |
| price_kobo | bigint | NO | — |
| currency | currency (enum) | NO | `'NGN'` |
| is_negotiable | boolean | NO | false |
| category_id | uuid → categories(id) SET NULL | YES | — |
| state_id | uuid → nigerian_states(id) SET NULL | YES | — |
| **city_area** | text | YES | — (Sprint 3 / Gap D.1; listing location. Nullable in DB for legacy tolerance, but app-required on create/edit) |
| status | product_status (enum) | NO | `'draft'` |
| view_count | integer | NO | 0 |
| is_featured | boolean | NO | false |
| **category_specs** | jsonb | YES | — (Phase D.7) |
| published_at | timestamptz | YES | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

**Notes:**
- `slug` is NOT NULL and has NO default — every insert must provide one. Default `status` is `'draft'`, not `'active'`.
- `category_specs` (added Phase D.7) is per-listing JSONB matching the active category's spec schema.
- `city_area` (Sprint 3 / Gap D): schema-permissive (nullable), app-strict (required on create/edit via exported `validateCityArea()`, min 3 / max 100). Legacy NULL rows prompt backfill on next edit.
- `status='sold'` is now reachable via the seller mark-as-sold flow (Sprint 3 / Gap B, `setListingStatusAction`). Marketplace/category queries filter `status='active'`, so sold listings drop out of buyer search but stay in the seller dashboard.
- `price_kobo` updates fire the `products_price_change_log` AFTER UPDATE trigger which writes to `price_history`. The trigger uses a WHEN clause to fire only on actual price changes.

### `profiles`

User profiles. One-to-one with `auth.users`. Created automatically via `handle_new_user` trigger.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid → auth.users(id) CASCADE | NO | — (PK matches auth) |
| display_name | text | NO | — |
| handle | text | YES | — (UNIQUE when set) |
| **phone** | text | NO | — (UNIQUE; renamed from `whatsapp_number` in Phase E.1.0 per D-055) |
| user_type | user_type (enum) | NO | `'buyer'` |
| role | user_role (enum) | YES | NULL |
| avatar_path | text | YES | — |
| is_disabled | boolean | NO | false |
| **verification_status** | text[] | NO | `'{}'::text[]` (Phase E.1.0) |
| **auth_providers** | text[] | NO | `'{}'::text[]` (Phase E.1.0) |
| **full_name** | text | YES | — (Phase E.1.0) |
| **state_id** | uuid → nigerian_states(id) | YES | — (Phase E.1.0) |
| **tier** | text | NO | `'free'` (Phase E.1.0; values `'free'`/`'pro'`/`'premium'`/`'institution'`) |
| **tier_started_at** | timestamptz | YES | — (Phase E.1.0) |
| **tier_expires_at** | timestamptz | YES | — (Phase E.1.0) |
| **signup_free_reveals_remaining** | integer | NO | `1` (Phase E.2.0.0 / D-084; 1 free contact reveal granted at signup. Backfill on deploy: profiles created ≥30 days prior → 0; <30 days → 1) |
| **pro_activated_at** | timestamptz | YES | — (Phase E.2.0.1 / D-083; set on first Pro subscription activation, backfilled from `MIN(subscriptions.started_at)`. NULL = never activated Pro. Drives the new/established Pro reveal-cap tenure check) |
| **last_seen_at** | timestamptz | YES | — (Stage 2.B / D-109 / migration **E.2.5.0**, verified live 2026-05-22; no backfill. Written by messaging server actions on send / open-thread / open-list. Asymmetric display per D-109 — seller→buyer shown, buyer→seller not, in MVP. Every write also bumps `updated_at` via `set_updated_at` — accepted.) |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

**Notes:**
- `role` is nullable; `NULL` means "regular user." Only admins have `role = 'admin'`.
- `phone` (renamed from `whatsapp_number` in Phase E.1.0 / D-055) is the buyer's primary contact phone in E.164-no-plus format.
- `verification_status` array tracks completed verifications. Phase E.1: sets `'phone_verified'` and optionally `'email_verified'`. Phase F+ adds `'google_verified'` / `'facebook_verified'`. Phase H+ adds `'bvn_verified'` / `'nin_verified'`.
- `auth_providers` array tracks linked sign-in methods.
- `tier` drives Pro-feature gating. Default `'free'`.
- `signup_free_reveals_remaining` (E.2.0.0 / D-084): every new buyer gets 1 free contact reveal at signup. First reveal attempt decrements to 0. After exhaustion, buyer must buy a credit pack or subscribe to Pro. Replaces the rejected 14-day Pro trial (harvesting attack vector).
- `pro_activated_at` (E.2.0.1 / D-083): consumed by `get_buyer_reveal_cap(uuid)` — Pro buyers within 30 days of activation get 10 reveals/day, established Pro buyers (30+ days, no open reports) get 25/day. NULL or open-reports → falls back to 10/day cap.

### `push_subscriptions`

Empty in Phase E; Phase F+ populates for browser push notifications.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid → profiles(id) CASCADE | NO | — |
| endpoint | text | NO | — |
| keys | jsonb | YES | — |
| created_at | timestamptz | NO | now() |

**Constraints:**
- UNIQUE (user_id, endpoint)

### `reports`

User-filed moderation reports against listings, users, or messages. Admin reviews manually (no auto-actions in Phase E).

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| reporter_id | uuid → profiles(id) CASCADE | NO | — |
| target_type | report_target_type (enum) | NO | — |
| target_id | uuid | NO | — (listing_id, user_id, or message_id) |
| reason | text | NO | — |
| description | text | YES | — (CHECK length ≤ 200) |
| status | report_status (enum) | NO | `'new'` |
| case_id | uuid | YES | — (Phase F+ case clustering) |
| created_at | timestamptz | NO | now() |
| first_viewed_at | timestamptz | YES | — |
| first_action_at | timestamptz | YES | — |
| resolved_at | timestamptz | YES | — |

**Constraints:**
- `reports_description_length` CHECK (description IS NULL OR char_length(description) <= 200)

**Indexes:**
- `reports_target_idx` btree on (target_type, target_id)
- `reports_status_idx` btree on (status, created_at)
- `reports_reporter_target_idx` btree on (reporter_id, target_type, target_id, created_at) — supports the application-layer 7-day rate-limit lookup

**Notes:**
- Per D-070, the 7-day "1 report per reporter per target" rate limit is enforced in the report-creation server action, not via partial unique index (`NOW() - INTERVAL` is non-immutable and rejected by Postgres in partial index predicates). The composite reporter_target index makes the lookup cheap.

### `restricted_categories`

Empty in Phase E; Phase G+ uses for prescription items, firearms, age-gated categories.

| Column | Type | Nullable | Default |
|---|---|---|---|
| category_id | uuid → categories(id) CASCADE | NO | — (PRIMARY KEY — one restriction per category) |
| restriction_type | text | YES | — (`'requires_verification'`, `'requires_kyc'`, `'banned'`) |
| min_seller_tier | text | YES | — |
| notes | text | YES | — |

### `saved_listings`

Buyer bookmarks. Phase E ships bookmarks-only; schema accommodates notes (Phase F+), price alerts (Phase F+), cart semantics (Phase G+) without future migration.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| buyer_id | uuid → profiles(id) CASCADE | NO | — |
| product_id | uuid → products(id) CASCADE | NO | — |
| note | text | YES | — (Phase F+) |
| alert_price_threshold | bigint | YES | — (Phase F+ price alerts) |
| quantity | integer | YES | — (Phase G+ cart semantics) |
| created_at | timestamptz | NO | now() |

**Constraints:**
- UNIQUE (buyer_id, product_id)

**Indexes:**
- `saved_listings_buyer_idx` btree on (buyer_id, created_at)
- `saved_listings_product_idx` btree on (product_id)

### `saved_searches`

Empty in Phase E; Phase F+ ships as Pro buyer feature (re-run a search on demand or alert when matches arrive).

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| buyer_id | uuid → profiles(id) CASCADE | NO | — |
| query | text | YES | — |
| category_id | uuid → categories(id) SET NULL | YES | — |
| state_id | uuid → nigerian_states(id) SET NULL | YES | — |
| filters | jsonb | YES | — |
| alert_enabled | boolean | NO | false |
| created_at | timestamptz | NO | now() |

### `search_query_log`

Every marketplace search logged for Phase E analytics insights (Phase F+ surfaces).

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid → profiles(id) SET NULL | YES | — (nullable for anonymous searches) |
| query | text | NO | — |
| category_id | uuid → categories(id) SET NULL | YES | — |
| state_id | uuid → nigerian_states(id) SET NULL | YES | — |
| results_count | integer | YES | — |
| first_click_position | integer | YES | — |
| searched_at | timestamptz | NO | now() |

**Indexes:**
- `search_query_log_user_idx` btree on (user_id, searched_at)
- `search_query_log_searched_idx` btree on (searched_at)

### `seller_auto_reply`

Empty in Phase E; Phase F+ ships as Pro seller feature.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| seller_id | uuid → profiles(id) CASCADE | NO | — |
| enabled | boolean | NO | false |
| trigger_type | text | YES | — (`'first_message'`, `'after_hours'`, `'always'`) |
| message_template | text | YES | — |
| created_at | timestamptz | NO | now() |

### `seller_payout_accounts`

Phase E Stage 2.B Commit 1.6 / D-120 (migration **E.2.7.0**, verified live 2026-05-23). Seller's registered payout account. One row per seller (UNIQUE on `seller_id`). Profile-keyed because most ShowMePrice sellers at MVP don't have a business record (D-116 Levels 1-2); `business_id` is optional and informational only at MVP.

**Supersedes K-009's `seller_verifications.bank_*` placeholders.** Those columns remain in production until a future cleanup migration drops them; D-120 stops using them.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| seller_id | uuid → profiles(id) CASCADE | NO | — (UNIQUE) |
| business_id | uuid → businesses(id) SET NULL | YES | — (informational only at MVP; labels which business this payout is associated with for L3 Business Verified sellers) |
| bank_name | text | NO | — (CHECK length 1-200) |
| account_number_encrypted | text | NO | — (Base64(IV ‖ ciphertext ‖ tag) — AES-256-GCM via Web Crypto; key in Cloudflare env `PAYMENT_DETAILS_ENCRYPTION_KEY`. DB cannot decrypt. CHECK length 1-2048) |
| account_name | text | NO | — (CHECK length 1-200) |
| registered_at | timestamptz | NO | now() |
| last_changed_at | timestamptz | YES | — (set on each UPDATE; NULL until first change after registration) |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

**Constraints:**
- `seller_payout_accounts_seller_id_key` UNIQUE (`seller_id`) — one payout account per seller.
- `seller_payout_accounts_bank_name_check`, `_account_number_encrypted_check`, `_account_name_check` — length bounds.
- FKs: `_seller_id_fkey` (CASCADE), `_business_id_fkey` (SET NULL).

**Indexes:**
- PK + UNIQUE on `seller_id` + `seller_payout_accounts_business_idx` btree partial on `(business_id) WHERE business_id IS NOT NULL`.

**RLS (3 policies — verified 2026-05-23):**
- `seller_payout_accounts_self_select` (SELECT): `seller_id = auth.uid()`
- `seller_payout_accounts_self_insert` (INSERT): WITH CHECK `seller_id = auth.uid()`
- `seller_payout_accounts_self_update` (UPDATE): USING + CHECK `seller_id = auth.uid()`

No DELETE policy — re-share supersedes via `payment_detail_shares`; the payout row itself is updated in place.

### `seller_verifications`

Originally a banking-focused table from Phase A. Phase C.5 P.1 ALTERed it to add identity-verification columns. Banking columns remain NOT NULL and are populated with the placeholder string `"PENDING"` until Phase G builds the payout flow (K-009 — **effectively closed by D-120 / `seller_payout_accounts`; the `bank_*` columns here are dead-code-in-data pending a future cleanup migration**).

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| business_id | uuid → businesses(id) CASCADE | NO | — |
| **Banking (Phase A)** | | | |
| id_document_path | text | NO | — |
| secondary_document_path | text | YES | — |
| bank_account_number | text | NO | — (placeholder `"PENDING"` until Phase G) |
| bank_name | text | NO | — (placeholder `"PENDING"` until Phase G) |
| bank_account_holder | text | NO | — (placeholder `"PENDING"` until Phase G) |
| **Identity (Phase C.5 P.1)** | | | |
| legal_first_name | text | YES | — |
| legal_last_name | text | YES | — |
| address_line_1 | text | YES | — |
| address_line_2 | text | YES | — |
| city | text | YES | — |
| address_state_id | uuid → nigerian_states(id) | YES | — |
| nin | text | YES | — |
| id_document_type | id_document_type (enum) | YES | — |
| selfie_path | text | YES | — |
| **Status + review** | | | |
| status | verification_status (enum) | NO | `'pending'` |
| reviewed_by | uuid → profiles(id) SET NULL | YES | — |
| reviewed_at | timestamptz | YES | — |
| rejection_reason | text | YES | — |
| submitted_at | timestamptz | NO | now() |

**Notes:** The `address_state_id` FK constraint is `seller_verifications_address_state_id_fkey` (PostgreSQL default naming — P.1 used raw `ALTER TABLE`, not Drizzle migration syntax). Prefer implicit FK resolution in Supabase embeds.

### `shipping_addresses`

Empty in Phase E; Phase G+ populates for fulfillment.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid → profiles(id) CASCADE | NO | — |
| full_name | text | YES | — |
| phone | text | YES | — |
| street_address | text | YES | — |
| city | text | YES | — |
| state_id | uuid → nigerian_states(id) SET NULL | YES | — |
| postal_code | text | YES | — |
| is_default | boolean | NO | false |
| created_at | timestamptz | NO | now() |

### `shipping_quotes`

Empty in Phase E; Phase G+ populates with per-order delivery-partner quotes.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| order_id | uuid → orders(id) CASCADE | NO | — |
| delivery_partner_id | uuid → delivery_partners(id) SET NULL | YES | — |
| quoted_amount_kobo | bigint | YES | — |
| estimated_delivery_days | integer | YES | — |
| quoted_at | timestamptz | NO | now() |

### `subscriptions`

Pro tier paid subscriptions. Reshaped in Phase E.1.1 (D-055) — Phase A columns dropped (`tier`, `paystack_customer_code`, `paystack_subscription_code`, `paystack_plan_code`, `amount_kobo`, `currency`, `updated_at`), Phase E columns added. Phase E populates via Paystack `PaymentGateway` (D-078).

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid → profiles(id) CASCADE | NO | — (column renamed from `profile_id` in E.1.1) |
| payment_provider | text | NO | `'paystack'` |
| provider_subscription_code | text | YES | — |
| plan_code | text | NO | — (`'pro_monthly_launch'`, `'pro_monthly_standard'`, `'pro_annual_launch'`, `'pro_annual_standard'`) |
| status | text | NO | — (`'active'`, `'attention'`, `'non-renewing'`, `'completed'`, `'cancelled'`) |
| started_at | timestamptz | YES | — |
| current_period_start | timestamptz | YES | — |
| current_period_end | timestamptz | YES | — |
| cancel_at_period_end | boolean | YES | false |
| cancelled_at | timestamptz | YES | — |
| payment_method | text | YES | — (`'card'`, `'direct_debit'`) |
| created_at | timestamptz | YES | now() |
| **promo_code** | text | YES | — (Phase E.2.0.3 / D-087; promo identifier e.g. `'LAUNCH_3K'`. NULL = no promo) |
| **promo_expires_at** | timestamptz | YES | — (Phase E.2.0.3 / D-087; when promo rate ends. For LAUNCH_3K: `created_at + 90 days`. NULL = standard pricing) |

**Notes:**
- 15 columns logical order (13 from E.1.1 reshape + 2 promo columns from E.2.0.3). Ordinal positions 3/4/5/6/7/10/11/13 are gaps from Phase A DROP COLUMNs in E.1.1 (standard Postgres behavior).
- Promo columns (E.2.0.3): a subscription is on promo pricing while `NOW() < promo_expires_at`. After expiry, Paystack renewal proceeds at standard rate via the `pro_monthly_launch → pro_monthly_standard` plan transition (D-087). Launch promo is monthly-only — no annual promo per D-087.
- FK constraint `subscriptions_profile_id_profiles_id_fk` is stale per D-080 — name still references old `profile_id` column though the column is now `user_id`. Functional but cosmetic; rename deferred.
- The orphan index `subscriptions_profile_idx` (post-rename btree on `user_id`) was dropped in E.1.2 cleanup (D-069). Current btree-on-user_id index is `subscriptions_user_idx`.
- The pre-existing `subscription_tier` enum was unused going forward (plan_code text is canonical, D-055 framework) and was dropped in D-080.1 (2026-05-20).

### `tier_features`

Tier ↔ feature key matrix. Seeded with free + pro rows in E.1.5; Phase G+ adds premium; Phase H+ adds institution.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| tier | text | NO | — (`'free'`, `'pro'`, `'premium'`, `'institution'`) |
| feature_key | text | NO | — |
| enabled | boolean | YES | true |
| metadata | jsonb | YES | — |

**Constraints:**
- UNIQUE (tier, feature_key)

### `user_tier_history`

Append-only log of every tier change. Drives "Pro for X months" displays, churn analytics, refund audit.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid → profiles(id) | YES | — |
| from_tier | text | YES | — |
| to_tier | text | YES | — |
| reason | text | YES | — (`'upgrade'`, `'downgrade'`, `'cancellation'`, `'refund'`, `'admin_action'`) |
| amount_paid_kobo | bigint | YES | — |
| payment_id | uuid → payments(id) | YES | — |
| changed_at | timestamptz | YES | now() |

---

## Enums

Eleven custom enums in the `public` schema. (Originally thirteen; `subscription_status` + `subscription_tier` dropped in D-080.1, 2026-05-20, after the post-E.1.1 move to `text` columns left them with zero references.)

| Enum | Values |
|---|---|
| `currency` | `NGN` |
| `escrow_order_status` | `initiated`, `funded`, `shipped`, `delivered`, `released`, `disputed`, `refunded`, `cancelled` |
| `id_document_type` | `nin_slip`, `drivers_license`, `voters_card`, `international_passport` (Phase C.5 P.1) |
| `product_status` | `draft`, `active`, `sold`, `archived` |
| `user_role` | `admin` |
| `user_type` | `buyer`, `seller` |
| `verification_status` | `unverified`, `unsubmitted`, `pending`, `verified`, `rejected` |
| **`notification_event`** | `new_message`, `seller_reply`, `listing_sold`, `price_drop`, `verification_status_change`, `pro_renewal_upcoming`, `pro_renewal_succeeded`, `pro_renewal_failed`, `pro_subscription_ending`, `report_action_taken`, `admin_message`, `listing_reported`, `listing_hidden` (Phase E.1.0) |
| **`report_target_type`** | `listing`, `user`, `message` (Phase E.1.0) |
| **`report_status`** | `new`, `in_review`, `resolved`, `dismissed` (Phase E.1.0) |
| **`credit_pack_type`** | `trial`, `small`, `medium`, `large` (Phase E.2.0.4 / D-085; used by `payments.pack_type`) |

**Notes:**
- `subscription_status` and `subscription_tier` (Phase A) were no longer referenced by the post-E.1.1 `subscriptions` table — `subscriptions.status` is now plain `text` and `plan_code` replaces the tier concept. Both enums were `DROP TYPE`d in D-080.1 (2026-05-20) after the audit (§3) confirmed zero column references.
- `verification_status` does NOT contain `'suspended'`.
- `user_role` has only `'admin'` — there's no "seller" or "buyer" role. Use `user_type` for that distinction.
- Phase E intentionally uses `text` (not enum) for new tier-related columns (`profiles.tier`, `businesses.seller_tier`, `subscriptions.plan_code`) to allow tier additions without enum-alter migrations.

---

## RLS Policies

**Verified state (2026-05-22):** all 44 tables have RLS enabled; 29 have policies deployed; 15 are RLS-enabled-zero-policies (deferred-feature/service-role-only tables — see the Tables note above for the list). The earlier "Phase E.1.x policies not yet applied / pending E.1.4" claim was stale and is removed.

Policy bodies below cover the Phase A/C.5 tables + `conversations` + `messages`. The other ~19 policied E.1.x tables (`blocks`, `reports`, `notification_log`, `notification_preferences`, `filter_rules`, `filter_actions_log`, `saved_listings`, `search_query_log`, `credit_balances`, `payments`, `price_history`, `tier_features`, `user_tier_history`, `admin_action_log`, `admin_emails`, `admins`) have deployed policies whose bodies are not yet transcribed here — tracked as **K-028** (doc-completeness pass).

### `admin_role_changes` (Phase E.2.2.0 / D-105)
- `admin_role_changes_select_admins` (SELECT): `public.is_admin(auth.uid())` — admins read the audit trail
- No INSERT/UPDATE/DELETE policy — append-only from the API's perspective; writes happen only via the `grant_admin_role`/`revoke_admin_role` SECURITY DEFINER functions or service_role.

### `businesses`
- `businesses_admin_update` (UPDATE): admin only
- `businesses_owner_insert` (INSERT): WITH CHECK `auth.uid() = owner_id`
- `businesses_owner_update` (UPDATE): `auth.uid() = owner_id` (BUT see `businesses_freeze_verification` trigger)
- `businesses_public_read` (SELECT): `is_disabled = false`

**Important:** `businesses_public_read` does NOT gate on `verification_status`. Public visibility of unverified sellers is gated transitively via `products` RLS.

### `categories`
- `categories_admin_write` (ALL): admin only
- `categories_public_read` (SELECT): everyone

### `contact_reveals`
- Pre-E.1.1 had buyer_insert, buyer_read, seller_read, admin_read policies. E.1.1 reshape preserved RLS, but the policy bodies reference column names that no longer exist (e.g., the seller_read policy depended on `auth.uid() = seller_id`, which still works since `seller_id` is unchanged).
- **TODO confirm during E.1.4:** verify each existing policy still matches the new column shape. The reshape kept buyer/seller/product columns but renamed `product_id → listing_id`. Any policy referencing `product_id` needs updating.

### `conversations` (Phase E.1.x; verified deployed 2026-05-22)
- `conversations_admin_all` (ALL): `is_admin(auth.uid())`
- `conversations_buyer_insert` (INSERT): WITH CHECK `auth.uid() = buyer_id` (only the buyer creates a conversation)
- `conversations_party_read` (SELECT): `auth.uid() = buyer_id OR auth.uid() = seller_id`
- `conversations_party_update` (UPDATE): USING + WITH CHECK `auth.uid() = buyer_id OR auth.uid() = seller_id`

### `escrow_orders`
- `escrow_orders_admin_all` (ALL): admin only
- `escrow_orders_buyer_insert` (INSERT): WITH CHECK `auth.uid() = buyer_id`
- `escrow_orders_party_read` (SELECT): `auth.uid() = buyer_id OR auth.uid() = seller_id`

### `messages` (Phase E.1.x; verified deployed 2026-05-22)
- `messages_admin_all` (ALL): `is_admin(auth.uid())`
- `messages_party_read` (SELECT): EXISTS a `conversations` row where `c.id = messages.conversation_id AND (auth.uid() = c.buyer_id OR auth.uid() = c.seller_id)`
- `messages_party_update` (UPDATE): USING + WITH CHECK — same party-of-conversation EXISTS check (drives `read_at` updates)
- `messages_sender_insert` (INSERT): WITH CHECK `auth.uid() = sender_id AND` party-of-conversation EXISTS check (a sender can only post into a conversation they belong to)

### `nigerian_states`
- `nigerian_states_admin_write` (ALL): admin only
- `nigerian_states_public_read` (SELECT): everyone

### `product_images`
- `product_images_admin_all` (ALL): admin only
- `product_images_public_read` (SELECT): EXISTS product with `status = 'active'`
- `product_images_seller_read` (SELECT): EXISTS product owned by `auth.uid()`
- `product_images_seller_write` (ALL): EXISTS product owned by `auth.uid()`

### `products`
- `products_admin_all` (ALL): admin only
- `products_public_read_active` (SELECT): `status = 'active'` (does NOT gate on business verification)
- `products_seller_delete` (DELETE): `auth.uid() = seller_id`
- `products_seller_insert` (INSERT): WITH CHECK `auth.uid() = seller_id AND EXISTS business owned by auth.uid()`
- `products_seller_read_own` (SELECT): `auth.uid() = seller_id`
- `products_seller_update` (UPDATE): `auth.uid() = seller_id`

### `profiles`
- `profiles_admin_update` (UPDATE): admin only
- `profiles_public_read` (SELECT): `is_disabled = false`
- `profiles_self_update` (UPDATE): `auth.uid() = id` (BUT see `profiles_freeze_role` trigger)

### `seller_verifications`
- `seller_verifications_admin_all` (ALL): admin only
- `seller_verifications_self_insert` (INSERT): WITH CHECK EXISTS business owned by `auth.uid()`
- `seller_verifications_self_read` (SELECT): EXISTS business owned by `auth.uid()`

### `subscriptions`
- `subscriptions_admin_read` (SELECT): admin only
- `subscriptions_self_read` (SELECT): `auth.uid() = user_id` (Phase E.1.4.b — Postgres auto-rewrote the policy body when E.1.1 renamed `profile_id → user_id`; the E.1.4.b DROP + recreate was therefore a no-op confirmation, not a fix. See D-080 scope clarification for the auto-rewrite finding.)

**Notes:** No INSERT/UPDATE policies for sellers on `subscriptions` — subscription mutations happen exclusively via service role (Paystack webhook handler).

---

## Triggers

Business-logic triggers (excluding auto-generated FK constraint triggers).

### `businesses`
- **`businesses_freeze_verification`** (BEFORE UPDATE) — blocks non-admin changes to `verification_status`
- `businesses_set_updated_at` (BEFORE UPDATE)

### `categories`
- `categories_set_updated_at` (BEFORE UPDATE)

### `escrow_orders`
- `escrow_orders_set_updated_at` (BEFORE UPDATE)

### `products`
- **`products_seller_matches_business_trigger`** (BEFORE INSERT/UPDATE) — enforces `seller_id = businesses.owner_id`
- `products_set_updated_at` (BEFORE UPDATE)
- **`products_price_change_log`** (AFTER UPDATE OF price_kobo) — Phase E.1.2. Fires WHEN `OLD.price_kobo IS DISTINCT FROM NEW.price_kobo`. Calls `log_product_price_change()` to insert a row into `price_history`.

### `profiles`
- **`profiles_freeze_role`** (BEFORE UPDATE) — blocks non-admin changes to `role`. Phase E.2.2.0 / D-105 added a transaction-local GUC bypass branch: if `current_setting('app.role_change_authorized', true) = 'on'` the change is allowed. That GUC is set (LOCAL scope, dies at txn end) only inside `grant_admin_role` / `revoke_admin_role` (both service_role-locked); `set_config` lives in `pg_catalog`, not exposed via PostgREST, so no other caller can set it. The original admin-EXISTS check is otherwise intact. (Note: this function does NOT pin `SET search_path` — tracked as K-021.)
- `profiles_set_updated_at` (BEFORE UPDATE)

### `subscriptions`
- `subscriptions_set_updated_at` (BEFORE UPDATE) — **note:** the post-E.1.1 `subscriptions` table no longer has an `updated_at` column. This trigger was preserved by ALTER-in-place but may need adjustment in E.1.4 or a follow-up cleanup migration.

**Notes:** All freeze triggers raise `RAISE EXCEPTION` when a non-admin attempts to change the protected column. **Service role does NOT bypass these triggers** because `auth.uid()` returns NULL under service_role JWT — the admin check fails. To make a state change that the trigger would block, EITHER the caller must be an authenticated admin user OR the change must be made via a `SECURITY DEFINER` function owned by `postgres`.

---

## Functions

| Function | Arguments | Returns | Purpose |
|---|---|---|---|
| `enforce_product_seller_matches_business` | (trigger context) | trigger | Trigger function for products INSERT/UPDATE check |
| `freeze_business_verification` | (trigger context) | trigger | Trigger function on businesses UPDATE |
| `freeze_profile_role` | (trigger context) | trigger | Trigger function on profiles UPDATE |
| `handle_new_user` | (trigger context) | trigger | Creates profile row on auth.users insert. Reads `display_name` and `phone` from `NEW.raw_user_meta_data` (passed via `supabase.auth.signUp({ options: { data: ... } })`). Falls back to `split_part(email, '@', 1)` if display_name missing, empty string if phone missing, with COALESCE on legacy `whatsapp_number` key for backwards compatibility (Phase E.1.0.1 hotfix). Does NOT read `user_type` or `role` — application code must set those after signup. |
| **`is_admin`** | `check_user_id uuid` | boolean | Checks if given user_id is admin. Reads `profiles.role = 'admin'`. **Does NOT consult the `admins` entity** — that table is Phase E §14 future-state; current RLS still uses the profiles-based admin model (per D-081 Phase F+ unification deferral). |
| `set_updated_at` | (trigger context) | trigger | Generic updated_at maintenance |
| **`log_product_price_change`** | (trigger context) | trigger | Phase E.1.2. Inserts a row into `price_history` (product_id, price_kobo, changed_by = NEW.seller_id) on every price_kobo change. Per D-071, `changed_by` attribution uses `NEW.seller_id` — best-effort, since DB triggers can't reliably resolve `auth.uid()`. Admin price overrides are captured in `admin_action_log` instead. |
| **`get_buyer_reveal_cap`** | `p_user_id uuid` | integer | Phase E.2.0.1 / D-083. Returns the daily contact-reveal cap for a buyer. Free → 0 (convention: no per-day cap; caller checks `signup_free_reveals_remaining` + `credit_balances`). Pro new (<30d) / missing `pro_activated_at` / has open reports → 10. Pro established (30+d, no open reports) → 25. Institution → 25 (Phase E placeholder). Legacy `'premium'` → treated as Pro (defensive; shouldn't exist post-D-082). STABLE, SECURITY DEFINER, `search_path=public`. Open-reports check computed-on-read against `reports` (target_type='user', status IN 'new'/'in_review'). |
| **`compute_escrow_fee`** | `p_amount_kobo bigint, p_user_id uuid` | bigint | Phase E.2.0.2 / D-086. Returns escrow fee in kobo. Raises exception below ₦50,000 (5,000,000 kobo). Pro rate 1.2% + ₦100 if an active subscription exists (`status='active' AND current_period_end > NOW()`), else standard 1.5% + ₦100. Integer half-up rounding `(amount × rate + 500) / 1000 + 10000`. Reads billing-authoritative `subscriptions` (NOT `profiles.tier`) — catches cancelled-but-tier-stale + past-due edge cases. STABLE, SECURITY DEFINER, `search_path=public`. |
| **`grant_admin_role`** | `p_target_user_id uuid, p_granter_id uuid, p_reason text` | boolean | Phase E.2.2.0 / D-105. Atomic admin grant + audit. `p_granter_id` NULL = bootstrap (service_role-trusted; the calling action guarantees `email = ADMIN_BOOTSTRAP_EMAIL`); NOT NULL must be an active admin (defense in depth). Idempotent: already-admin → returns `false`, no audit row. Sets the `app.role_change_authorized` GUC (LOCAL) to pass `freeze_profile_role`, UPDATEs `profiles.role='admin'`, INSERTs an `admin_role_changes` row (`action` = `'bootstrap'`/`'granted'`). SECURITY DEFINER, `search_path=public`. **EXECUTE locked down**: triple-`REVOKE` from `anon`/`authenticated`/`PUBLIC`, then `GRANT` to `service_role` only. |
| **`revoke_admin_role`** | `p_target_user_id uuid, p_granter_id uuid, p_reason text` | boolean | Phase E.2.2.0 / D-105. Atomic admin revoke + audit. No bootstrap path — `p_granter_id` must be an active admin. Self-revoke forbidden (raises). Idempotent: non-admin target → returns `false`, no audit row. Last-active-admin guard (defense in depth; normally shadowed by the self-revoke + granter-must-be-admin guards). Sets the `app.role_change_authorized` GUC (LOCAL), UPDATEs `profiles.role=NULL`, INSERTs an `admin_role_changes` row (`action='revoked'`). SECURITY DEFINER, `search_path=public`. Same triple-`REVOKE` + `service_role`-only lockdown as `grant_admin_role`. |
| **`mark_phone_verified`** | `p_verification_id uuid, p_user_id uuid, p_provider_tag text` | boolean | Phase E.2.1.1 / Stage 2.A. Atomic verify-success across two tables: under `FOR UPDATE`, validates the row belongs to `p_user_id` and is unconsumed, sets `consumed_at`, then idempotently appends `'phone_verified'` to `profiles.verification_status` and `p_provider_tag` (e.g. `'arkesel_phone'`) to `profiles.auth_providers`. Returns `true` on success, `false` if no row / wrong user / already consumed (benign concurrent-consume — the action gates validity; this gates atomicity). SECURITY DEFINER, `search_path=public`. **EXECUTE locked down**: triple-`REVOKE` from `anon`, `authenticated`, AND `PUBLIC`, then `GRANT` to `service_role` only — Supabase auto-grants anon/authenticated on public functions, and `REVOKE FROM PUBLIC` alone does NOT remove those (the lockdown gap caught at E.2.1.1 §2d; commit `13bf8d4`). Note: as of E.2.11.0, this function additionally must NOT be passed `phone_verifications` rows whose `purpose <> 'profile_phone'` — the caller (`verifyPhoneOtpAction`) filters by purpose. The RPC itself doesn't read `purpose`; the discipline is at the action layer. |
| **`mark_seller_whatsapp_verified`** | `p_verification_id uuid, p_user_id uuid` | boolean | Phase E.2.11.0 / Stage A — sibling to `mark_phone_verified` for the seller-WhatsApp inline OTP flow. Under `FOR UPDATE`, validates: row exists, `v_row.user_id = p_user_id`, `v_row.purpose = 'seller_whatsapp'` (this RPC refuses profile-phone-purpose rows; crossing the streams would mis-route the grant), `v_row.consumed_at IS NULL`. Looks up the seller's business via the UNIQUE `businesses.owner_id = p_user_id` (no `p_business_id` parameter — the UNIQUE constraint is the authority). On success: sets `phone_verifications.consumed_at`, writes `businesses.seller_whatsapp = v_row.phone` + `seller_whatsapp_verified_at = now()`. The number written is read from `v_row.phone` (never a trusted parameter — guarantees the stored number is the one the user provably received the OTP on). **Does NOT touch** `profiles.verification_status`, `profiles.phone`, or `profiles.auth_providers` (the whole point of a sibling RPC vs. parameterizing `mark_phone_verified`). The UPDATE on `businesses` does not include `verification_status`, so `businesses_freeze_verification` (BEFORE UPDATE) does not raise. Returns `true` on success, `false` if no row / wrong user / wrong purpose / already consumed / no business found. SECURITY DEFINER, `search_path=public`. **EXECUTE locked down**: triple-`REVOKE` from `anon`/`authenticated`/`PUBLIC`, then `GRANT` to `service_role` only. Live ACL verified `{postgres=X/postgres, service_role=X/postgres}`. |

**Critical:** `is_admin` requires a `uuid` argument. There is NO parameterless `is_admin()` form. RLS policies and triggers must call `is_admin(auth.uid())`.

**Phase E.2 buyer-side functions** (`get_buyer_reveal_cap`, `compute_escrow_fee`) are both STABLE + SECURITY DEFINER + `search_path=public`-locked. The SECURITY DEFINER pattern lets them read `reports` / `subscriptions` regardless of caller RLS context (needed when computing a buyer's own cap/fee); the search_path lock prevents schema-injection. They are pure computation over current DB state — safe to call from server actions, RLS policies, or background jobs.

---

## Foreign Key Constraints

**~70 FK constraints total** across the 43 tables (plus the two `admin_role_changes` FKs added in E.2.2.0 — RESTRICT on `target_user_id`, SET NULL on `granter_id`). Documented below by category. Two naming conventions coexist on this database:
- Drizzle migration default: `<table>_<col>_<reftable>_<refcol>_fk`
- PostgreSQL auto-naming for raw `ALTER TABLE`: `<table>_<col>_fkey`

Some constraint names are stale post-E.1.1 column renames (D-080) — functional, cosmetic only.

### Phase A/C.5/D FKs (existing)

| Constraint | From | To | On Delete |
|---|---|---|---|
| `businesses_owner_id_profiles_id_fk` | businesses.owner_id | profiles.id | CASCADE |
| `businesses_state_id_nigerian_states_id_fk` | businesses.state_id | nigerian_states.id | SET NULL |
| `categories_parent_id_categories_id_fk` | categories.parent_id | categories.id | RESTRICT |
| `contact_reveals_buyer_id_profiles_id_fk` | contact_reveals.buyer_id | profiles.id | CASCADE |
| `contact_reveals_product_id_products_id_fk` ⚠️ | contact_reveals.listing_id (column renamed) | products.id | CASCADE |
| `contact_reveals_seller_id_profiles_id_fk` | contact_reveals.seller_id | profiles.id | CASCADE |
| `escrow_orders_buyer_id_profiles_id_fk` | escrow_orders.buyer_id | profiles.id | RESTRICT |
| `escrow_orders_product_id_products_id_fk` | escrow_orders.product_id | products.id | RESTRICT |
| `escrow_orders_seller_id_profiles_id_fk` | escrow_orders.seller_id | profiles.id | RESTRICT |
| `product_images_product_id_products_id_fk` | product_images.product_id | products.id | CASCADE |
| `products_business_id_businesses_id_fk` | products.business_id | businesses.id | CASCADE |
| `products_category_id_categories_id_fk` | products.category_id | categories.id | SET NULL |
| `products_seller_id_profiles_id_fk` | products.seller_id | profiles.id | CASCADE |
| `products_state_id_nigerian_states_id_fk` | products.state_id | nigerian_states.id | SET NULL |
| `profiles_id_auth_users_fk` | profiles.id | auth.users.id | CASCADE |
| `profiles_state_id_nigerian_states_id_fk` | profiles.state_id | nigerian_states.id | NO ACTION (E.1.0) |
| `seller_verifications_business_id_businesses_id_fk` | seller_verifications.business_id | businesses.id | CASCADE |
| `seller_verifications_reviewed_by_profiles_id_fk` | seller_verifications.reviewed_by | profiles.id | SET NULL |
| `seller_verifications_address_state_id_fkey` | seller_verifications.address_state_id | nigerian_states.id | NO ACTION |
| `subscriptions_profile_id_profiles_id_fk` ⚠️ | subscriptions.user_id (column renamed) | profiles.id | CASCADE |

⚠️ = stale constraint name post-E.1.1 rename (D-080); rename deferred.

### Phase E FKs (E.1.1 / E.1.2 / E.1.3)

All Phase E FKs use Drizzle naming convention (`<table>_<col>_<reftable>_<refcol>_fkey` from raw ALTER syntax in the migration SQL, except where explicitly named otherwise). Comprehensive list available via the D2 dump query; key cross-table relationships:

- **payments.user_id** → profiles.id
- **subscriptions.user_id** → profiles.id (CASCADE; constraint name stale)
- **credit_balances.user_id** → profiles.id (PK FK)
- **tier_features** — no FKs (text-only)
- **conversations**: buyer_id, seller_id → profiles; listing_id → products
- **messages**: conversation_id → conversations; sender_id → profiles
- **notification_preferences**: user_id → profiles (PK FK with event_type)
- **notification_log**: user_id → profiles
- **user_tier_history**: user_id → profiles; payment_id → payments
- **contact_reveals**: buyer_id, seller_id → profiles; listing_id → products; payment_id → payments
- **filter_rules** — no FKs
- **filter_actions_log**: user_id → profiles SET NULL; rule_id is plain UUID (FK to filter_rules deferred to E.1.5 per E.1.2 design)
- **admin_action_log**: admin_id → admins
- **admin_emails**: admin_id → admins; recipient_user_id → profiles SET NULL
- **reports**: reporter_id → profiles CASCADE
- **blocks**: blocker_id, blocked_id → profiles CASCADE
- **search_query_log**: user_id → profiles SET NULL; category_id → categories SET NULL; state_id → nigerian_states SET NULL
- **saved_listings**: buyer_id → profiles CASCADE; product_id → products CASCADE
- **price_history**: product_id → products CASCADE; changed_by → profiles SET NULL
- **saved_searches**: buyer_id → profiles CASCADE; category_id → categories SET NULL; state_id → nigerian_states SET NULL
- **seller_auto_reply**: seller_id → profiles CASCADE
- **restricted_categories**: category_id → categories CASCADE (PK FK)
- **shipping_addresses**: user_id → profiles CASCADE; state_id → nigerian_states SET NULL
- **delivery_partners** — no FKs
- **orders**: buyer_id, seller_id → profiles RESTRICT; listing_id → products SET NULL; conversation_id → conversations SET NULL; escrow_id → escrow_transactions SET NULL; shipping_address_id → shipping_addresses SET NULL; delivery_partner_id → delivery_partners SET NULL
- **order_status_history**: order_id → orders CASCADE; changed_by → profiles SET NULL
- **shipping_quotes**: order_id → orders CASCADE; delivery_partner_id → delivery_partners SET NULL
- **escrow_transactions**: order_id → orders RESTRICT; buyer_id, seller_id → profiles RESTRICT
- **institution_accounts**: primary_contact_id → profiles SET NULL; account_manager_id → admins SET NULL
- **kyc_documents**: user_id → profiles CASCADE
- **message_reactions**: message_id → messages CASCADE; user_id → profiles CASCADE
- **message_image_analysis**: message_id → messages CASCADE
- **push_subscriptions**: user_id → profiles CASCADE

**Circular FK note:** `orders.escrow_id` ↔ `escrow_transactions.order_id` form a cycle, resolved in E.1.3 by creating both tables first then adding `orders.escrow_id` constraint via ALTER TABLE.

**Operationally:** prefer **implicit FK resolution** in Supabase embeds — `nigerian_states(name)` rather than `nigerian_states!<constraint>(name)`. PostgREST auto-resolves the embed when the column→table mapping is unambiguous, and the embed survives any future rename.

---

## Unique Constraints

| Constraint | Table | Columns | Meaning |
|---|---|---|---|
| `businesses_owner_id_unique` | businesses | owner_id | One business per user |
| `businesses_slug_unique` | businesses | slug | Business slugs globally unique |
| `categories_slug_unique` | categories | slug | Category slugs globally unique |
| `nigerian_states_iso_code_unique` | nigerian_states | iso_code | State ISO codes unique |
| `nigerian_states_name_unique` | nigerian_states | name | State names unique |
| `nigerian_states_slug_unique` | nigerian_states | slug | State slugs globally unique |
| `products_slug_unique` | products | slug | Listing slugs globally unique |
| `profiles_handle_unique` | profiles | handle | User handles unique when set |
| `profiles_phone_unique` | profiles | phone | Phone numbers unique (Phase E.1.0) |
| `admins_email_key` | admins | email | Admin emails unique |
| `blocks_blocker_id_blocked_id_key` | blocks | blocker_id, blocked_id | One block row per directed pair |
| `saved_listings_buyer_id_product_id_key` | saved_listings | buyer_id, product_id | One bookmark per (buyer, product) |
| `tier_features_tier_feature_key_key` | tier_features | tier, feature_key | One row per (tier, feature) |
| `message_reactions_message_id_user_id_reaction_key` | message_reactions | message_id, user_id, reaction | One reaction-type per user per message |
| `push_subscriptions_user_id_endpoint_key` | push_subscriptions | user_id, endpoint | One subscription per (user, endpoint) |
| `conversations_buyer_seller_listing_unique` | conversations | (buyer_id, seller_id, listing_id) WHERE conversation_type='buyer_seller' | Partial unique — one buyer↔seller conversation per listing |
| `notification_preferences_pkey` | notification_preferences | user_id, event_type | Composite PK enforces uniqueness |
| `credit_balances_pkey` | credit_balances | user_id | Composite PK (one balance per user) |
| `restricted_categories_pkey` | restricted_categories | category_id | PK = category_id |

---

## CHECK Constraints

| Constraint | Table | Predicate |
|---|---|---|
| `filter_rules_action_check` | filter_rules | `action IN ('block', 'warn', 'allow')` |
| `reports_description_length` | reports | `description IS NULL OR char_length(description) <= 200` |
| `blocks_no_self` | blocks | `blocker_id <> blocked_id` |
| `payments_pack_type_only_for_credit_pack` | payments | `pack_type IS NULL OR payment_type = 'credit_pack'` (Phase E.2.0.4 / D-085) |

(Additional CHECKs may exist from E.1.1 — D4 returned 12 total. Rerun the D4 query if a comprehensive list is needed for a specific operation.)

---

## Storage Buckets

Three buckets in Supabase Storage. All have explicit RLS policies; service role bypasses for admin signed-URL generation only.

### `verification-id-documents` (Phase C.5 P.3)

**Public:** NO. Strict private bucket for seller ID documents (NIN slip, driver's license, voter's card, international passport).
**File size limit:** 10 MB.
**Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
**Folder structure:** `{user_id}/<filename>`.
**RLS policies (3):**
- `verification_id_documents_owner_select` — authenticated user reads their own folder.
- `verification_id_documents_owner_insert` — same folder check on INSERT.
- `verification_id_documents_admin_select` — admin reads any object.

### `verification-selfies` (Phase C.5 P.3)

**Public:** NO. Strict private bucket for ID-holding selfies.
**File size limit:** 5 MB.
**Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`.
**Folder structure:** `{user_id}/<filename>`.
**RLS policies (3):** same shape as `verification-id-documents`.

### `product-images` (Phase D.2 P.1)

**Public:** YES. Public-read bucket for marketplace product images.
**File size limit:** 5 MB.
**Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`.
**Folder structure:** `{business_id}/{product_id}/<filename>`.
**RLS policies (3):**
- `product_images_owner_insert` — INSERT requires the business folder match the authenticated user's owned business.
- `product_images_owner_delete` — same business-ownership check on DELETE.
- `product_images_public_select` — anyone can SELECT.

**Render boundary:** `storage_path` (relative) becomes a public URL via `getProductImagePublicUrl(path)` in `src/lib/storage.ts`. Never use the raw `storage_path` value as `<img src>`.

---

## Complete category taxonomy (post-Sprint-3 / Gap D.0a)

**Top-level totals:** 7 Tier 1 + 11 Tier 2 + 11 Tier 3 = **29 parents**. Subcategories: **79 rows**. Total: **108 category rows**.

### Tier 1 — featured on home page (7)

| Slug | Name |
|---|---|
| `fashion` | Fashion & Apparel |
| `mobile-phones-tablets` | Mobile Phones & Tablets |
| `hair-wigs` | Hair & Wigs |
| `beauty` | Beauty & Personal Care |
| `electronics` | Electronics & Gadgets |
| `home-living` | Home & Furniture |
| `power-generators` | Power & Generators (Sprint 3 / Gap D.0a, sort_order 7) |

### Tier 2 — `/categories` index (11)

| Slug | Name | sort_order |
|---|---|---|
| `health` | Health & Wellness | 7 |
| `baby-kids` | Baby & Kids | 8 |
| `foodstuff` | Foodstuff & Groceries | 9 |
| `vehicles` | Automotive | 10 |
| `property` | Property | 11 |
| `sports` | Sports & Fitness | 12 |
| `computer-accessories` | Computer & Accessories | 13 |
| `travel-luggage` | Travel & Luggage | 14 |
| `drinks` | Drinks & Beverages | 15 |
| `perfume-fragrance` | Perfume & Fragrance | 16 |
| `building-materials` | Building Materials & Supplies | 17 |

### Tier 3 — "Other categories" disclosure (11)

| Slug | Name |
|---|---|
| `services` | Services |
| `books-media` | Books & Media |
| `pets` | Pets |
| `industrial` | Industrial & Business |
| `office-supplies` | Office Supplies & Equipment |
| `tools-hardware` | Tools & Hardware |
| `garden-outdoor` | Garden & Outdoor |
| `musical-instruments` | Musical Instruments |
| `arts-crafts` | Arts & Crafts |
| `photography-equipment` | Photography Equipment |
| `religious-items` | Religious Items |

### Subcategories (79 total)

| Parent | Subs | Slugs |
|---|---|---|
| Fashion & Apparel | 6 | `mens-clothing`, `womens-clothing`, `kids-clothing`, `traditional-ankara`, `shoes`, `accessories-fashion` |
| Mobile Phones & Tablets | 5 | `smartphones-new`, `smartphones-used`, `tablets`, `phone-accessories`, `smart-wearables` |
| Hair & Wigs | 5 | `human-hair-bundles`, `wigs`, `hair-extensions`, `closures-frontals`, `hair-care-products` |
| Electronics & Gadgets | 1 | `electronics-accessories` |
| Computer & Accessories | 6 | `laptops`, `desktops-workstations`, `monitors`, `keyboards-mice`, `storage-drives`, `computer-accessories-misc` |
| Travel & Luggage | 3 | `suitcases`, `backpacks-bags`, `travel-accessories` |
| Automotive | 4 | `cars`, `motorcycles`, `vehicle-parts`, `tricycles` |
| Foodstuff & Groceries | 10 | `grains-rice`, `spices-seasonings`, `cooking-oils`, `beans-legumes`, `tubers-flour`, `fresh-produce`, `frozen-foods`, `packaged-bakery`, `snacks-confectionery`, `baby-food` |
| Drinks & Beverages | 7 | `alcohol-spirits`, `wine`, `beer`, `soft-drinks`, `juices`, `water`, `coffee-tea` |
| Perfume & Fragrance | 8 | `perfume-men`, `perfume-women`, `perfume-unisex`, `perfume-oud`, `body-sprays`, `perfume-oils`, `deodorants`, `car-perfumes` |
| Building Materials & Supplies | 10 | `cement-concrete`, `tiles`, `roofing-materials`, `doors-windows`, `blocks-bricks-stones`, `iron-steel-rods`, `plumbing-sanitary`, `electrical-wiring`, `paint-finishing`, `ceiling-interior` |
| Power & Generators | 4 | `generators`, `inverters`, `solar-panels`, `batteries` |

Beauty & Personal Care, Home & Furniture, and Tier 2's other parents currently carry no subcategories; future product-launch demand may add them.

---

## Migration history

### Phase D
All Phase D `ALTER TABLE` migrations included `NOTIFY pgrst, 'reload schema'`. Verifying queries paired with each migration.

| Phase | Change | Verification approach |
|---|---|---|
| D.1 | `nigerian_states.slug` + `categories.tier` | `information_schema.columns` row count |
| D.4.1 | tier promotions + 7 new T3 + `tier`-aware `categories.is_featured` deferral | `SELECT slug, tier FROM categories ...` |
| D.7 | `products.category_specs jsonb` | `information_schema.columns` data_type check |
| D.7.2 | `categories.search_aliases jsonb` + 14-category seed | `jsonb_array_length` per row |
| D.7.3 | Tricycles subcategory + 4-category alias expansion | `count(*)` on subs + `jsonb_array_length` |
| D.7.3.1 | Alias narrowing (brand removal) | `jsonb_array_length` after-state |
| D.7.4 | `food-beverages` replaced by `foodstuff` + `drinks` + 17 subs | pre-flight `count(*)` listings, post check 9 T2 rows |
| D.7.5 | `perfume-fragrance` Tier 2 + 8 subs | 10 T2 rows, 8 children, alias counts |
| D.7.6 | `building-materials` Tier 2 + 10 subs | 11 T2 rows, 10 children, 63 aliases |

### Phase E Stage 1
All Phase E.1.x SQL blocks shipped with pre-flight diagnostics, BEGIN/COMMIT-wrapped migrations, `NOTIFY pgrst, 'reload schema'`, and V-query verification paste-back.

| Phase | Change | Verification |
|---|---|---|
| E.1.0 | Enum additions (3 new) + existing-table ALTERs (profiles +7 cols, businesses +3 cols, categories +1 col); `whatsapp_number → phone` rename | V1–V4 information_schema + pg_type checks |
| E.1.0.1 | `handle_new_user` trigger hotfix (COALESCE fallback to legacy meta_data key) | Live signup smoke test |
| E.1.1 | 10 tables (8 new + 2 reshape): payments, subscriptions, credit_balances, tier_features, conversations, messages, notification_preferences, notification_log, user_tier_history, filter_rules; contact_reveals + subscriptions ALTER-in-place | V1–V6 |
| E.1.2 | 9 tables (admins, reports, blocks, admin_action_log, admin_emails, filter_actions_log, search_query_log, saved_listings, price_history) + products price-change trigger + orphan index cleanup | V1–V6 |
| E.1.3 | 14 empty-schema tables (Phase F+/G+/H+ deferred features) | V1–V4 |
| E.1.3.1 | DROP TABLE admin_audit_log (D-081) | V1–V4 |
| E.2.6.0 | D-119 filter rules expansion: nuban warn→block (message context), 9 new D-119 rows (`phone_ng`, whatsapp typo, payment_url extra, shortened_url extra, telegram.org, `telegram_ref`, `off_platform_handoff` x2, `bank_platform_ref`). Listing-context rules deferred to K-036. K-029 whitelist guard extended to block-tier in `filters.ts` so legitimate ₦1B+ prices don't get hard-blocked. | §0 + §1 DO-block assertions + §2 paste-back (2026-05-23) |
| E.2.7.0 | D-120 registered payment details: `seller_payout_accounts` table (one row per seller, encrypted account number via Web Crypto AES-256-GCM, key in `PAYMENT_DETAILS_ENCRYPTION_KEY`) + `payment_detail_shares` table (per-conversation share events with jsonb snapshot + supersession). 5 RLS policies on shares (seller/buyer SELECT, seller INSERT, buyer/seller UPDATE) + 3 on payout accounts. Closes K-009 (the legacy `seller_verifications.bank_*` placeholders are now dead-code-in-data). | §0 + §1 DO-block assertions + §2 paste-back (2026-05-23) |
| E.2.11.0 | Stage A — seller-WhatsApp inline OTP foundation. `phone_verifications.purpose` (text, NOT NULL DEFAULT `'profile_phone'`, CHECK in `{'profile_phone','seller_whatsapp'}`; existing rows backfilled via DEFAULT) + partial index `phone_verifications_user_purpose_unconsumed_idx` on `(user_id, purpose, created_at DESC) WHERE consumed_at IS NULL`. `businesses.seller_whatsapp` (text, nullable, CHECK NULL-or-`^234\d{10}$`) + `businesses.seller_whatsapp_verified_at` (timestamptz, nullable). SECURITY DEFINER fn `mark_seller_whatsapp_verified(uuid, uuid)`: validates row+user+purpose+unconsumed, looks up business via UNIQUE `owner_id`, writes `seller_whatsapp = v_row.phone` (number read from the verified row, never a parameter) + `seller_whatsapp_verified_at = now()`, consumes the OTP row. Does NOT touch `profiles.*`. Triple-REVOKE'd to `service_role` only. The existing `mark_phone_verified` flow is unchanged. **Applied 2026-05-28** via Supabase SQL Editor running as `postgres` (after `RESET ROLE`) — verified §2a–§2h paste-back: purpose column live, partial index present, businesses columns + CHECK present, function `prosecdef=true` + `proconfig={search_path=public}`, ACL `{postgres=X/postgres, service_role=X/postgres}`. Migration file written + committed in the same commit as this entry — file-vs-applied-state reconciled. | §0 + §1 BEGIN/COMMIT + §2 paste-back (2026-05-28) |

---

## Schema gaps relative to project journal

The project journal (chat summary at start of conversations) was inaccurate in several places, mostly pre-Phase-E. Post-Stage-1 corrections:

- "12 tables" → 42 tables (Phase E Stage 1 net additions: +32 new tables, −1 drop, +0 net renames)
- `admin_audit_log` no longer exists (dropped E.1.3.1)
- "8 enums" → 13 enums (Phase E.1.0 added `notification_event`, `report_target_type`, `report_status`; Phase C.5 P.1 added `id_document_type`; Phase E.2.0.4 added `credit_pack_type`)
- `subscriptions` has been substantially reshaped — Phase A's `tier`/`paystack_*` columns dropped, Phase E's plan_code-based structure landed. The `subscription_tier` and `subscription_status` enums (Phase A) are dead code post-E.1.1.
- `contact_reveals` has been reshaped — Phase A's `channel`/`ip_hash`/`created_at` dropped, Phase E's reveal-tracking columns landed. Column `product_id` renamed to `listing_id`.
- `notifications` (claimed) → no such table; canonical is `notification_log` + `notification_preferences` from E.1.1
- `payment_records` (claimed) → no such table; canonical is `payments` from E.1.1
- Triggers `freeze_profile_role` / `freeze_business_verification` → actual names are `profiles_freeze_role` / `businesses_freeze_verification`

---

## Critical reading for future planners

1. **Always verify column names against this file** before writing INSERT/UPDATE statements or Supabase JS queries
2. **Phase E.1.x tables have NO RLS POLICIES yet** — pending E.1.4. Default-deny means any authenticated query without service_role will return zero rows. Don't waste cycles debugging "why is my query empty" before checking RLS status
3. **Freeze triggers are real and strict** — `businesses.verification_status` and `profiles.role` can ONLY be changed by authenticated admins. Service role does not bypass them
4. **`is_admin()` requires a uuid argument** — `is_admin(auth.uid())` not `is_admin()`. Note this checks `profiles.role = 'admin'`, NOT the new `admins` entity. Full admin-model unification deferred to Phase F+ (D-081)
5. **`slug` columns on `products` are NOT NULL with no default** — every product INSERT must generate a slug
6. **`product_images` columns are `storage_path` and `position`**, NOT `url` and `sort_order`. There is NO `is_primary` column
7. **`businesses` column is `business_name`**, NOT `name`
8. **`profiles.phone` (NOT `whatsapp_number`)** — renamed in Phase E.1.0. Old key still accepted via COALESCE fallback in `handle_new_user` for any pre-rename signup metadata still in flight
9. **`subscriptions.user_id` (NOT `profile_id`)** — renamed in Phase E.1.1. The FK constraint and one RLS policy still reference the old name; cosmetic for the FK (D-080), real bug for the RLS policy (E.1.4 fix)
10. **`contact_reveals.listing_id` (NOT `product_id`)** — renamed in Phase E.1.1. FK constraint name is stale per D-080
11. **`admin_action_log` is canonical for admin moderation audit** — `admin_audit_log` (Phase A) was dropped in E.1.3.1. New code writes only to `admin_action_log`
12. **`escrow_orders` is legacy** — D-059/D-072. New checkout/fulfillment work in Phase G+ uses `orders` + `escrow_transactions`. The legacy table stays through Phase E with no writes
13. **`kyc_documents` schema is provisional** — D-075. Don't depend on its current column shape; Stage 2 NIN integration may ALTER it
14. **FK constraint names follow two conventions** — Drizzle's `_<reftable>_<refcol>_fk` and PostgreSQL's `_fkey`. Some Phase E constraints have stale embedded column names (D-080). Never reference FK constraint names explicitly in Supabase JS embeds — use implicit resolution
15. **`handle_new_user` reads `phone` from raw_user_meta_data** — sign-up actions must set the metadata key `phone` (with `whatsapp_number` as the legacy fallback). Does NOT set `user_type` or `role` — application code updates those after signup
16. **Update this file when changing schema** in the same commit as the migration
