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
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

**Notes:** Column is `business_name`, NOT `name`. Default for `verification_status` was changed from `'pending'` to `'unsubmitted'` during Phase C.5 P.1.

### `categories`

Top-level + sub-categories. 14 top-level + 13 sub-categories seeded.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO | — |
| slug | text | NO | — |
| parent_id | uuid → categories(id) RESTRICT | YES | — |
| sort_order | integer | NO | 0 |
| icon_name | text | YES | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

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
| name | text | NO | — |
| iso_code | text | NO | — |
| created_at | timestamptz | NO | now() |

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
| published_at | timestamptz | YES | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

**Notes:** `slug` is NOT NULL and has NO default — every insert must provide one. Phase C's `createListingAction` does NOT set `slug` and would fail. Default `status` is `'draft'`, not `'active'` — Phase C explicitly sets `'active'` on insert which is valid (the enum allows it). `published_at` is intended to be set when status transitions from draft → active, but Phase C never sets it.

### `profiles`

User profiles. One-to-one with `auth.users`. Created automatically via `handle_new_user` trigger.

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid → auth.users(id) CASCADE | NO | — (PK matches auth) |
| display_name | text | NO | — |
| handle | text | YES | — |
| whatsapp_number | text | NO | — |
| user_type | user_type (enum) | NO | `'buyer'` |
| role | user_role (enum) | YES | NULL |
| avatar_path | text | YES | — |
| is_disabled | boolean | NO | false |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

**Notes:** `role` is nullable; `NULL` means "regular user." Only admins have `role = 'admin'`. The `freeze_profile_role` trigger prevents non-admins from changing this column. `handle` is unused in current code.

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

Eight custom enums in the `public` schema.

| Enum | Values |
|---|---|
| `currency` | `NGN` |
| `escrow_order_status` | `initiated`, `funded`, `shipped`, `delivered`, `released`, `disputed`, `refunded`, `cancelled` |
| `product_status` | `draft`, `active`, `sold`, `archived` |
| `subscription_status` | `active`, `past_due`, `cancelled`, `expired` |
| `subscription_tier` | `free`, `pro` |
| `user_role` | `admin` |
| `user_type` | `buyer`, `seller` |
| `verification_status` | `unverified`, `unsubmitted`, `pending`, `verified`, `rejected` |

**Notes:**
- `verification_status` does NOT contain `'suspended'` despite the original journal claim. Any spec references to `'suspended'` are dead code.
- `user_role` has only `'admin'` — there's no "seller" or "buyer" role. Use `user_type` for that distinction.
- `unverified` is a dormant value (Phase A's original default before P.1 changed it to `'unsubmitted'`).

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

Seven unique constraints in the `public` schema (separate from FK constraints).

| Constraint | Table | Columns | Meaning |
|---|---|---|---|
| `businesses_owner_id_unique` | businesses | owner_id | One business per user. New seller signup INSERT fails with duplicate-key if user already has a business. |
| `businesses_slug_unique` | businesses | slug | Business slugs are globally unique. |
| `categories_slug_unique` | categories | slug | Category slugs globally unique. |
| `nigerian_states_iso_code_unique` | nigerian_states | iso_code | State ISO codes unique. |
| `nigerian_states_name_unique` | nigerian_states | name | State names unique. |
| `products_slug_unique` | products | slug | Listing slugs globally unique. `generateListingSlug()` must produce unique output (random 4-char suffix). |
| `profiles_handle_unique` | profiles | handle | User handles unique when set (column is nullable). |

**Implications for application code:**
- Seller signup: business INSERT fails with constraint violation if user already has a business (good — enforces 1:1 owner→business)
- Listing creation: slug must be unique across the table. Random suffix in `generateListingSlug()` makes collision astronomically rare but not impossible. Retry on conflict if needed.
- Profile setup: any future "claim your handle" flow needs to handle the unique constraint on collision.
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
