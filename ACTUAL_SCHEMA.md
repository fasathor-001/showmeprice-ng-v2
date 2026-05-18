# ShowMePrice.ng v2 — Actual Database Schema (Verified)

> **This is the canonical reference.** When planning any phase, READ THIS FILE before writing spec that references database identifiers.
>
> Verified via `information_schema` and `pg_catalog` queries on 2026-05-15 during Phase C.5 pre-flight audit.
>
> If you change the schema (new tables, new columns, new policies, new triggers, new enums), update this file in the same commit.

---

## Tables (`public` schema)

12 tables total. Every table has RLS enabled.

### `admin_audit_log`

Generic audit log for admin actions.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| actor_id | uuid → profiles(id) RESTRICT | NO | — |
| action | text | NO | — |
| target | text | NO | — |
| metadata | jsonb | YES | — |
| created_at | timestamptz | NO | now() |

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
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

**Notes:**
- Column is `business_name`, NOT `name`. Default for `verification_status` was changed from `'pending'` to `'unsubmitted'` during Phase C.5 P.1.
- `seller_tier` (Phase E.1.0) tracks the seller's tier — `'free'`, `'verified'` (post-identity-verification, baseline), with Phase F+ adding `'pro_seller'`/`'premium_seller'` and Phase G+ adding `'enterprise_seller'`. Distinct from the buyer-side `profiles.tier` (a seller can be a Pro buyer in their other capacity).
- `seller_listing_limit` / `seller_reply_quota` are nullable and unenforced in Phase E (tracking-only schema). Phase F+ enforces per-tier ceilings.

### `categories`

Top-level + sub-categories. Post-Phase-D: 28 top-level (6 Tier 1 + 11 Tier 2 + 11 Tier 3) + 75 sub-categories = 103 rows total. See "Complete category taxonomy" section below for the inventory.

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
| **category_features** | jsonb | NO | `'{}'::jsonb` (Phase E.1.0; per-category feature flags — warning banners, high-value flags, required-field hints. Phase E uses for property warning banner migration from hardcoded; Phase F+ for category-specific Pro pricing) |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

**Notes:**
- `tier` (added Phase D.1) classifies top-level parents: 1 = home-page featured, 2 = `/categories` index standard, 3 = "Other categories" disclosure drawer. Subcategories carry the default value 3 — tier is semantically meaningful for top-level rows only.
- `search_aliases` (added Phase D.7.2) is a JSONB array of lowercased buyer-intent terms. Per D-049/D-050, contains category-level synonyms only; brand/model names match via title/description ilike instead. The marketplace search resolver checks containment via PostgREST's `cs.["<lower-of-query>"]` operator.
- `icon_name` is vestigial post-D.4.1 — `getCategoryEmoji()` keys on `slug` instead. New rows leave it NULL.

### `contact_reveals`

Records when buyers reveal seller WhatsApp contact. Phase F populates this.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| buyer_id | uuid → profiles(id) CASCADE | NO | — |
| product_id | uuid → products(id) CASCADE | NO | — |
| seller_id | uuid → profiles(id) CASCADE | NO | — |
| channel | text | NO | — |
| ip_hash | text | YES | — |
| created_at | timestamptz | NO | now() |

### `escrow_orders`

Phase H feature. Buyer pays via escrow, seller ships, buyer confirms, money released.

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
- `slug` (added Phase D.1) is the URL-friendly identifier used throughout the app — `?state=lagos`, `?state=akwa-ibom`. Seeded with `lower(replace(name, ' ', '-'))` per row, with explicit overrides for FCT → `abuja`, `Akwa Ibom` → `akwa-ibom`, `Cross River` → `cross-river`.
- `FEATURED_STATE_SLUGS` (in `src/lib/states.ts`) defines the 9 featured states for dropdown ordering and dynamic chip ranking.

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

**Notes:** Columns are `storage_path` (NOT `url`) and `position` (NOT `sort_order`). **There is NO `is_primary` column** — the image at `position = 0` is the primary. Phase C inserts referenced wrong column names; this is the source of multiple bugs documented in `KNOWN_ISSUES.md`.

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
| status | product_status (enum) | NO | `'draft'` |
| view_count | integer | NO | 0 |
| is_featured | boolean | NO | false |
| **category_specs** | jsonb | YES | — (Phase D.7) |
| published_at | timestamptz | YES | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

**Notes:**
- `slug` is NOT NULL and has NO default — every insert must provide one. Phase C's `createListingAction` does NOT set `slug` and would fail. Default `status` is `'draft'`, not `'active'` — Phase C explicitly sets `'active'` on insert which is valid (the enum allows it). `published_at` is intended to be set when status transitions from draft → active, but Phase C never sets it.
- `category_specs` (added Phase D.7) is per-listing JSONB matching the active category's spec schema (`src/lib/categorySpecs.ts`). Phones get `{condition: "UK-used"}`, vehicles get `{year: 2018, mileage_km: 35000}`, property gets `{property_type, bedrooms, bathrooms}`, etc. Subcategories inherit their parent's schema via `getSpecsForCategory(slug, parentSlug)`.

### `profiles`

User profiles. One-to-one with `auth.users`. Created automatically via `handle_new_user` trigger.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid → auth.users(id) CASCADE | NO | — (PK matches auth) |
| display_name | text | NO | — |
| handle | text | YES | — (UNIQUE when set) |
| **phone** | text | NO | — (UNIQUE; renamed from `whatsapp_number` in Phase E.1.0) |
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
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

**Notes:**
- `role` is nullable; `NULL` means "regular user." Only admins have `role = 'admin'`. The `freeze_profile_role` trigger prevents non-admins from changing this column. `handle` is unused in current code.
- `phone` (renamed from `whatsapp_number` in Phase E.1.0 / D-055) is the buyer's primary contact phone in E.164-no-plus format. In Nigerian context this is also the buyer's WhatsApp number — the UI may still surface it under "WhatsApp:" but the column name is canonical `phone`.
- `verification_status` array tracks completed verifications. Phase E.1 sets `'phone_verified'` and optionally `'email_verified'`. Phase F+ adds `'google_verified'` / `'facebook_verified'`. Phase H+ adds `'bvn_verified'` / `'nin_verified'` for high-value transactions.
- `auth_providers` array tracks which sign-in methods are linked. Phase E.1: `['termii_phone']`. Phase F+: `['termii_phone', 'google']` etc.
- `tier` drives Pro-feature gating. Default `'free'`. Phase E populates `'pro'` on subscription/credit-pack purchase. `tier_started_at` / `tier_expires_at` track lifecycle; `tier_expires_at` is NULL for free.

### `seller_verifications`

Originally a banking-focused table from Phase A. Phase C.5 P.1 ALTERed it to add identity-verification columns (the gate ShowMePrice actually shipped). Banking columns remain NOT NULL and are populated with the placeholder string `"PENDING"` until Phase G builds the payout flow (see K-009).

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

**Notes:** The `status` column shares the `verification_status` enum with `businesses.verification_status`. The `address_state_id` FK constraint is `seller_verifications_address_state_id_fkey` (PostgreSQL default naming because P.1 used raw `ALTER TABLE`, not Drizzle migration syntax) — diverges from the rest of the FKs on this table which use Drizzle's `_fk` convention. Prefer implicit FK resolution in Supabase embeds (see the FK Constraints section's guidance).

### `subscriptions`

Pro tier paid subscriptions. Phase G populates this via Paystack.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| profile_id | uuid → profiles(id) CASCADE | NO | — |
| tier | subscription_tier (enum) | NO | `'free'` |
| status | subscription_status (enum) | NO | `'active'` |
| paystack_customer_code | text | YES | — |
| paystack_subscription_code | text | YES | — |

**Notes:** Default tier is `'free'`. No expiry/renewal fields — those are tracked on Paystack's side.

---

## Enums

Twelve custom enums in the `public` schema (8 from Phases A/C.5, 3 new in Phase E.1.0, 1 reserved `id_document_type` from P.1 P-migration).

| Enum | Values |
|---|---|
| `currency` | `NGN` |
| `escrow_order_status` | `initiated`, `funded`, `shipped`, `delivered`, `released`, `disputed`, `refunded`, `cancelled` |
| `id_document_type` | `nin_slip`, `drivers_license`, `voters_card`, `international_passport` (Phase C.5 P.1) |
| `product_status` | `draft`, `active`, `sold`, `archived` |
| `subscription_status` | `active`, `past_due`, `cancelled`, `expired` |
| `subscription_tier` | `free`, `pro` |
| `user_role` | `admin` |
| `user_type` | `buyer`, `seller` |
| `verification_status` | `unverified`, `unsubmitted`, `pending`, `verified`, `rejected` |
| **`notification_event`** | `new_message`, `seller_reply`, `listing_sold`, `price_drop`, `verification_status_change`, `pro_renewal_upcoming`, `pro_renewal_succeeded`, `pro_renewal_failed`, `pro_subscription_ending`, `report_action_taken`, `admin_message`, `listing_reported`, `listing_hidden` (Phase E.1.0) |
| **`report_target_type`** | `listing`, `user`, `message` (Phase E.1.0) |
| **`report_status`** | `new`, `in_review`, `resolved`, `dismissed` (Phase E.1.0) |

**Notes:**
- `verification_status` does NOT contain `'suspended'` despite the original journal claim. Any spec references to `'suspended'` are dead code.
- `user_role` has only `'admin'` — there's no "seller" or "buyer" role. Use `user_type` for that distinction.
- `unverified` is a dormant value (Phase A's original default before P.1 changed it to `'unsubmitted'`).
- Phase E intentionally uses `text` (not enum) for new tier-related columns (`profiles.tier`, `businesses.seller_tier`) to allow tier additions without enum-alter migrations. The pre-existing `subscription_tier` enum is unused going forward; Phase E.1.1's reworked `subscriptions` table uses `plan_code text` instead.

---

## RLS Policies

Every table has RLS enabled. Policies use `is_admin(auth.uid())` for admin checks.

### `admin_audit_log`
- `admin_audit_log_admin_read` (SELECT): `is_admin(auth.uid())`

### `businesses`
- `businesses_admin_update` (UPDATE): admin only
- `businesses_owner_insert` (INSERT): WITH CHECK `auth.uid() = owner_id`
- `businesses_owner_update` (UPDATE): `auth.uid() = owner_id` (BUT see `businesses_freeze_verification` trigger)
- `businesses_public_read` (SELECT): `is_disabled = false`

**Important:** `businesses_public_read` does NOT gate on `verification_status`. Anyone can read business rows directly. Public visibility of unverified sellers is gated transitively via `products` RLS (the `products_public_read_active` policy filters products, and products are joined to businesses).

### `categories`
- `categories_admin_write` (ALL): admin only
- `categories_public_read` (SELECT): everyone

### `contact_reveals`
- `contact_reveals_admin_read` (SELECT): admin only
- `contact_reveals_buyer_insert` (INSERT): WITH CHECK `auth.uid() = buyer_id`
- `contact_reveals_buyer_read` (SELECT): `auth.uid() = buyer_id`
- `contact_reveals_seller_read` (SELECT): `auth.uid() = seller_id`

### `escrow_orders`
- `escrow_orders_admin_all` (ALL): admin only
- `escrow_orders_buyer_insert` (INSERT): WITH CHECK `auth.uid() = buyer_id`
- `escrow_orders_party_read` (SELECT): `auth.uid() = buyer_id OR auth.uid() = seller_id`

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

**Notes:** Sellers can insert AND read their own submissions but cannot UPDATE or DELETE (audit trail preservation). Admin has full ALL privileges via the single `_admin_all` policy.

### `subscriptions`
- `subscriptions_admin_read` (SELECT): admin only
- `subscriptions_self_read` (SELECT): `auth.uid() = profile_id`

**Notes:** No INSERT/UPDATE policies for sellers — subscription mutations happen exclusively via service role (Phase G's Paystack webhook handler).

---

## Triggers

Business-logic triggers (excluding auto-generated FK constraint triggers).

### `businesses`
- **`businesses_freeze_verification`** (BEFORE UPDATE) — blocks non-admin changes to `verification_status`
- `businesses_set_updated_at` (BEFORE UPDATE) — maintains `updated_at`

### `categories`
- `categories_set_updated_at` (BEFORE UPDATE)

### `escrow_orders`
- `escrow_orders_set_updated_at` (BEFORE UPDATE)

### `products`
- **`products_seller_matches_business_trigger`** (BEFORE INSERT) — enforces `seller_id = businesses.owner_id`
- `products_set_updated_at` (BEFORE UPDATE)

### `profiles`
- **`profiles_freeze_role`** (BEFORE UPDATE) — blocks non-admin changes to `role`
- `profiles_set_updated_at` (BEFORE UPDATE)

### `subscriptions`
- `subscriptions_set_updated_at` (BEFORE UPDATE)

**Notes:** All freeze triggers raise `RAISE EXCEPTION` when a non-admin attempts to change the protected column. They check `WHERE id = auth.uid() AND role = 'admin' AND is_disabled = false`. **Service role does NOT bypass these triggers** because `auth.uid()` returns NULL under service_role JWT — the admin check fails. To make a state change that the trigger would block, EITHER the caller must be an authenticated admin user OR the change must be made via a `SECURITY DEFINER` function owned by `postgres`.

---

## Functions

| Function | Arguments | Returns | Purpose |
|---|---|---|---|
| `enforce_product_seller_matches_business` | (trigger context) | trigger | Trigger function for products INSERT check |
| `freeze_business_verification` | (trigger context) | trigger | Trigger function on businesses UPDATE |
| `freeze_profile_role` | (trigger context) | trigger | Trigger function on profiles UPDATE |
| `handle_new_user` | (trigger context) | trigger | Creates profile row on auth.users insert. Reads `display_name` and `whatsapp_number` from `NEW.raw_user_meta_data` (passed via `supabase.auth.signUp({ options: { data: ... } })`). Falls back to `split_part(email, '@', 1)` if display_name missing, empty string if whatsapp_number missing. Does NOT read `user_type` or `role` — application code must set those after signup. |
| **`is_admin`** | `check_user_id uuid` | boolean | Checks if given user_id is admin |
| `set_updated_at` | (trigger context) | trigger | Generic updated_at maintenance |

**Critical:** `is_admin` requires a `uuid` argument. There is NO parameterless `is_admin()` form. RLS policies and triggers must call `is_admin(auth.uid())`.

---

## Foreign Key Constraints (with actual names)

All FK constraints use Drizzle's convention: `<table>_<column>_<reftable>_<refcolumn>_fk`.

| FK Constraint | From | To | On Delete |
|---|---|---|---|
| `admin_audit_log_actor_id_profiles_id_fk` | admin_audit_log.actor_id | profiles.id | RESTRICT |
| `businesses_owner_id_profiles_id_fk` | businesses.owner_id | profiles.id | CASCADE |
| `businesses_state_id_nigerian_states_id_fk` | businesses.state_id | nigerian_states.id | SET NULL |
| `categories_parent_id_categories_id_fk` | categories.parent_id | categories.id | RESTRICT |
| `contact_reveals_buyer_id_profiles_id_fk` | contact_reveals.buyer_id | profiles.id | CASCADE |
| `contact_reveals_product_id_products_id_fk` | contact_reveals.product_id | products.id | CASCADE |
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
| `seller_verifications_business_id_businesses_id_fk` | seller_verifications.business_id | businesses.id | CASCADE |
| `seller_verifications_reviewed_by_profiles_id_fk` | seller_verifications.reviewed_by | profiles.id | SET NULL |
| `seller_verifications_address_state_id_fkey` | seller_verifications.address_state_id | nigerian_states.id | NO ACTION (default) |
| `subscriptions_profile_id_profiles_id_fk` | subscriptions.profile_id | profiles.id | CASCADE |

**Two naming conventions exist** on the same database, because not all FKs were created by Drizzle:
- Drizzle migration default: `<table>_<col>_<reftable>_<refcol>_fk`
- PostgreSQL auto-naming for raw `ALTER TABLE ... REFERENCES ...`: `<table>_<col>_fkey`

The `seller_verifications` table demonstrates both — `business_id_businesses_id_fk` (Drizzle) and `address_state_id_fkey` (P.1 raw SQL). Any future raw-ALTER FK addition will land with the `_fkey` suffix unless the migration explicitly names the constraint.

**Operationally:** prefer **implicit FK resolution** in Supabase embeds — `nigerian_states(name)` rather than `nigerian_states!<constraint>(name)`. PostgREST auto-resolves the embed when the column→table mapping is unambiguous, and the embed survives any future rename or replacement. Only use the explicit `!constraint` form when you have multiple FKs between the same two tables and need to disambiguate; in that case, verify the exact name via `SELECT conname FROM pg_constraint WHERE conrelid = 'tablename'::regclass`.

---

## Unique Constraints

Eight unique constraints in the `public` schema (separate from FK constraints).

| Constraint | Table | Columns | Meaning |
|---|---|---|---|
| `businesses_owner_id_unique` | businesses | owner_id | One business per user. New seller signup INSERT fails with duplicate-key if user already has a business. |
| `businesses_slug_unique` | businesses | slug | Business slugs are globally unique. |
| `categories_slug_unique` | categories | slug | Category slugs globally unique. |
| `nigerian_states_iso_code_unique` | nigerian_states | iso_code | State ISO codes unique. |
| `nigerian_states_name_unique` | nigerian_states | name | State names unique. |
| `nigerian_states_slug_unique` | nigerian_states | slug | State slugs globally unique (Phase D.1). |
| `products_slug_unique` | products | slug | Listing slugs globally unique. `generateListingSlug()` must produce unique output (random 4-char suffix). |
| `profiles_handle_unique` | profiles | handle | User handles unique when set (column is nullable). |

**Implications for application code:**
- Seller signup: business INSERT fails with constraint violation if user already has a business (good — enforces 1:1 owner→business)
- Listing creation: slug must be unique across the table. Random suffix in `generateListingSlug()` makes collision astronomically rare but not impossible. Retry on conflict if needed.
- Profile setup: any future "claim your handle" flow needs to handle the unique constraint on collision.

---

## Storage Buckets

Three buckets in Supabase Storage. All have explicit RLS policies; service role bypasses for admin signed-URL generation only.

### `verification-id-documents` (Phase C.5 P.3)

**Public:** NO. Strict private bucket for seller ID documents (NIN slip, driver's license, voter's card, international passport).
**File size limit:** 10 MB.
**Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
**Folder structure:** `{user_id}/<filename>`.
**RLS policies (3):**
- `verification_id_documents_owner_select` — authenticated user reads their own folder (`(storage.foldername(name))[1] = auth.uid()::text`).
- `verification_id_documents_owner_insert` — same folder check on INSERT.
- `verification_id_documents_admin_select` — admin reads any object (`is_admin(auth.uid())`).

### `verification-selfies` (Phase C.5 P.3)

**Public:** NO. Strict private bucket for ID-holding selfies.
**File size limit:** 5 MB.
**Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`.
**Folder structure:** `{user_id}/<filename>`.
**RLS policies (3):** same shape as `verification-id-documents` (`verification_selfies_owner_select`, `verification_selfies_owner_insert`, `verification_selfies_admin_select`).

### `product-images` (Phase D.2 P.1)

**Public:** YES. Public-read bucket for marketplace product images — listings render via `<img>` without signed URLs.
**File size limit:** 5 MB.
**Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`.
**Folder structure:** `{business_id}/{product_id}/<filename>`.
**RLS policies (3):**
- `product_images_owner_insert` — INSERT requires the business folder match the authenticated user's owned business (`EXISTS businesses WHERE owner_id = auth.uid() AND id::text = (storage.foldername(name))[1]`).
- `product_images_owner_delete` — same business-ownership check on DELETE.
- `product_images_public_select` — anyone can SELECT (the bucket is public).

**Render boundary:** `storage_path` (relative) becomes a public URL via `getProductImagePublicUrl(path)` in `src/lib/storage.ts`. Never use the raw `storage_path` value as `<img src>`.

---

## Complete category taxonomy (post-D.7.6)

**Top-level totals:** 6 Tier 1 + 11 Tier 2 + 11 Tier 3 = **28 parents**. Subcategories: **75 rows**. Total: **103 category rows**.

### Tier 1 — featured on home page (6)

| Slug | Name |
|---|---|
| `fashion` | Fashion & Apparel |
| `mobile-phones-tablets` | Mobile Phones & Tablets |
| `hair-wigs` | Hair & Wigs |
| `beauty` | Beauty & Personal Care |
| `electronics` | Electronics & Gadgets |
| `home-living` | Home & Furniture |

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

### Subcategories (75 total)

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

Beauty & Personal Care, Home & Furniture, and Tier 2's other parents currently carry no subcategories; future product-launch demand may add them.

**Aliases:** 14 Tier 1+2 categories carry `search_aliases` JSONB arrays (Phase D.7.2 onwards). The marketplace search resolver (`/marketplace?q=...`) checks name match OR alias containment OR title/description match in a single `.or()` clause, then fans out to subcategories of any matched parent (`category_id IN (...)`). See `src/app/marketplace/page.tsx`.

---

## Migration history (Phase D)

All Phase D `ALTER TABLE` migrations included `NOTIFY pgrst, 'reload schema'` at the end of the SQL block to refresh PostgREST's schema cache. Without the NOTIFY, schema changes don't surface to API clients until Supabase's automatic cache refresh ticks (60s+).

Verifying queries paired with each migration:

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

Pattern banked as a working-practice rule in `MEMORY.md`: every owner SQL pre-flight should include an inline verification query the owner pastes back as proof of application.

---

## Schema gaps relative to project journal

The project journal (chat summary at start of conversations) was inaccurate in several places. Items to correct:

- "11 tables" → actually 12 (admin_audit_log was missing from journal count)
- "8 enums" → confirmed 8, but values were wrong:
- "Unique constraints" — the original audit checked FK constraints (`contype = 'f'`) but not unique constraints (`contype = 'u'`). Seven unique constraints exist; documented in the new Unique Constraints section.
- "`handle_new_user` body" — original audit listed the function but not its behavior. Now documented in the Functions section above.
  - `verification_status` does not include `'suspended'`
  - Journal didn't mention `unverified` value
- "Triggers: freeze_profile_role and freeze_business_verification" → actual names are `profiles_freeze_role` and `businesses_freeze_verification` (different naming convention)
- "pro_subscriptions" → actual table is `subscriptions`
- "payment_records" → no such table; payments tracked on `escrow_orders.paystack_transaction_reference` and `subscriptions.paystack_*` columns
- "business_documents" → no such table; banking documents are columns on `seller_verifications`
- "notifications" → no such table

---

## Critical reading for future planners

1. **Always verify column names against this file** before writing INSERT/UPDATE statements or Supabase JS queries
2. **Never assume default RLS allows your operation** — RLS is strict and FK constraints have explicit CASCADE/RESTRICT/SET NULL behavior
3. **Freeze triggers are real and strict** — `businesses.verification_status` and `profiles.role` can ONLY be changed by authenticated admins. Service role does not bypass them
4. **`is_admin()` requires a uuid argument** — `is_admin(auth.uid())` not `is_admin()`
5. **`slug` columns on `products` are NOT NULL with no default** — every product INSERT must generate a slug
6. **`product_images` columns are `storage_path` and `position`**, NOT `url` and `sort_order`. There is NO `is_primary` column
7. **`businesses` column is `business_name`**, NOT `name`
8. **Update this file when changing schema** in the same commit as the migration
9. **Phase A freeze trigger naming is `<table>_freeze_<thing>`, NOT `freeze_<table>_<thing>`.** Actual names: `businesses_freeze_verification` and `profiles_freeze_role`. Searching by the wrong convention will find nothing.
10. **handle_new_user does NOT set user_type or role.** Signup actions must UPDATE profiles after auth signup if the user is a seller (`profiles_self_update` RLS allows this). The `profiles_freeze_role` trigger only blocks `role` changes, not `user_type`.
11. **FK constraint names come from two conventions on this database.** PostgreSQL auto-names FKs from raw `ALTER TABLE` with the `_fkey` suffix; Drizzle migrations use `_<reftable>_<refcol>_fk`. Same table can have both (`seller_verifications` does). Never reference FK constraint names explicitly in Supabase JS embeds — use implicit resolution (`nigerian_states(name)`, not `nigerian_states!<constraint>(name)`). Implicit form resolves regardless of source.
