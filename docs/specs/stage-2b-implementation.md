# Stage 2.B Implementation Specification

**Document type:** Implementation Specification
**Stage:** Stage 2.B (Messaging System)
**Status:** Ready for agent execution (D-111 → D-118 banked).
**Schema reconciliation:** Corrected in-place against the **verified deployed schema** (ACTUAL_SCHEMA.md + Phase 1 paste-back, 2026-05-22). The original draft was written from memory/banked decisions and carried seven schema discrepancies; all corrected here. Reference this file — not the original draft — for the 7 commits.

## Overview
Stage 2.B implements the core messaging system that enables buyers and sellers to communicate in-platform — the foundation of ShowMePrice's trust-first positioning (on-platform, safety-filtered, logged, free).

The `conversations` and `messages` tables, their RLS policies, Realtime publication membership (+ `REPLICA IDENTITY FULL`), and the `filter_rules` ruleset are **already deployed** (Stage 2.B Phase 2 + E.2.3.0/E.2.4.0). This stage builds the server actions and UI on top — plus the one missing column (`profiles.last_seen_at`, added in Commit 1's E.2.5.0 migration).

## Scope

### In scope
1. Server actions for messaging CRUD operations.
2. Conversation list UI (buyer + seller view).
3. Message thread UI (per-conversation).
4. Message composer with safety-filter integration.
5. Realtime subscription for new messages.
6. First-message template integration (D-108, `messages.metadata.template_id`).
7. `last_seen_at` update on message activity (D-109) — **incl. the E.2.5.0 migration adding the column**.
8. Safety nudges visible inline.
9. Phone-verification gate on messaging entry points (D-114).

### Out of scope (later stages)
- Contact-reveal action UI (Stage 2.F)
- Reporting UI (Stage 2.E)
- Verification badges on user info / trust box / price-required validation (Stage 2.C)
- Paystack credit purchase (Stage 3.A)
- Multi-level verification gating (Stage 4)
- Account state machine beyond existing states

## Dependencies (verified 2026-05-22)
- ✅ `conversations` table (deployed)
- ✅ `messages` table (deployed)
- ✅ RLS policies on both (deployed — 4 each; party-scoped)
- ✅ Realtime publication membership + `REPLICA IDENTITY FULL` (verified live; K-030)
- ✅ `filter_rules` with D-110 / Interpretation-C patterns (deployed via E.2.3.0)
- ✅ `messages.metadata` (jsonb NOT NULL) supports `template_id` (D-108)
- ⛔ `profiles.last_seen_at` — **NOT yet deployed.** D-109 banked the decision; the column is added by **E.2.5.0 in Commit 1** (DB-first).

## Verified deployed schema (reference — DO NOT recreate)

### `conversations`
`id` uuid PK · `buyer_id` uuid→profiles(id) RESTRICT NOT NULL · `seller_id` uuid→profiles(id) RESTRICT NOT NULL · `listing_id` uuid→**products**(id) RESTRICT NOT NULL · `conversation_type` text NOT NULL default `'buyer_seller'` · `status` text NOT NULL default `'active'` (CHECK in active/archived/listing_sold/listing_deleted) · `last_message_at` timestamptz · `last_message_type` text · `created_at` timestamptz NOT NULL default now().
- **No `updated_at`** — use `last_message_at` for recency/sort.
- **No per-conversation read columns** — read state is per-message (see `messages.read_at`).
- Partial unique: `conversations_buyer_seller_listing_unique` on (buyer_id, seller_id, listing_id) **WHERE `conversation_type='buyer_seller'`**.
- Indexes: buyer/seller `(*, last_message_at DESC)`, listing.

### `messages`
`id` uuid PK · `conversation_id` uuid→conversations(id) **CASCADE** NOT NULL · `sender_id` uuid→profiles(id) RESTRICT NOT NULL · `message_type` text NOT NULL default `'text'` (CHECK in text/image/voice_note/**offer**/system) · `content` text **NULLABLE** · `metadata` jsonb **NOT NULL** default `'{}'` · `attachment_url` text · `read_at` timestamptz · `created_at` timestamptz NOT NULL default now().
- Indexes: `messages_conversation_idx` (conversation_id, created_at) · `messages_unread_idx` partial (conversation_id) **WHERE `read_at IS NULL`**.
- `message_type='offer'` already allowed (D-099 offers need no schema change).
- `content` nullable supports image/offer messages; the app enforces text-message content rules.

### RLS (deployed — party-scoped)
- `conversations`: admin_all · buyer_insert (`auth.uid()=buyer_id`) · party_read · party_update (buyer or seller).
- `messages`: admin_all · party_read (EXISTS conversation party) · party_update (same) · sender_insert (`sender_id=auth.uid()` AND party-of-conversation).

## Architecture decisions

### 1. Server actions vs API routes
Use Next.js server actions (project convention): CSRF protection, server-side validation, direct DB access, end-to-end types.

### 2. Realtime strategy
Supabase Realtime per conversation. Channel `conversation:{conversation_id}`; subscribe on thread mount, unsubscribe on unmount; optimistic send + reconcile on Realtime confirm. `REPLICA IDENTITY FULL` is live, so RLS-filtered UPDATE events (e.g. `read_at`) deliver.

### 3. Safety filter integration (D-110, deployed `filter_rules`)
Apply filters synchronously in `createConversation` (first message) and `sendMessage`, against the **deployed** `filter_rules` schema:
- Select active rules where **`'message' = ANY(applies_to_context)`** (text[]) AND the **user's tier ∈ `applies_to_tier`** (text[], `free`/`pro`).
- Run each rule's `pattern` (regex) against content. `action` is one of **`block` / `warn` / `allow`**:
  - `block` matched → reject (e.g. WhatsApp/Signal/Telegram links, payment_url, shortened_url per Interpretation C).
  - `warn` matched → allow, set `metadata.contains_warning = true` (e.g. email/nuban/phone/social_handle, tier `free` only).
- Log every action to `filter_actions_log` (context=`'message'`, context_id=message_id, rule_id, rule_action, original_content, user_proceeded).
- **No `admin_review` action and no `risk_events` table exist at MVP** — admin escalation is deferred (D-097).
- **K-029:** before surfacing a `nuban` warning, apply the §10 price/negotiation whitelist (₦/k/last-price etc.) to suppress false positives on prices.

### 4. Template tracking (D-108)
First-message templates render client-side; the chosen text is sent as the message. Store `metadata.template_id: string` (+ optional `metadata.template_edited: boolean`) on the message. Server treats it as analytics metadata only.

### 5. last_seen_at updates (D-109)
Update `profiles.last_seen_at` on: send message · open conversation thread · open conversation list. Lightweight UPDATE inside the relevant server actions (not middleware). Asymmetric **display** per D-109 (seller last-seen shown to buyers; buyer last-seen not shown to sellers) is a Stage 2.C UI concern — the column is written here.

### 6. Phone-verification gate (D-114)
`createConversation` and `sendMessage` reject non-phone-verified users via the existing `isPhoneVerified` (`@/lib/auth`) helper — returning `PhoneVerificationRequired` — before any listing lookup / filter check. UI prompts unverified users to verify before showing the composer.

## Server actions specification

### Action 1: `createConversation`
Buyer initiates a conversation with a seller about a listing.
**Inputs:** `listingId` (req), `firstMessageContent` (req), `templateId?`, `templateEdited?`.
**Validation/process:**
1. Authenticated; **`isPhoneVerified` → else `PhoneVerificationRequired`**.
2. Listing (`products`) exists + published; get `seller_id` (+ `business_id`).
3. Buyer ≠ seller (can't message own listing).
4. Existing `buyer_seller` conversation for (buyer, seller, listing)? → return its id (partial unique index also guards).
5. Run D-110 filter (§3) on `firstMessageContent`; `block` → `ContentBlocked` (with reason).
6. Insert `conversations` row; insert first `messages` row (`message_type='text'`, `metadata.template_id` if provided, `metadata.contains_warning` if warned); set `last_message_at`/`last_message_type`.
7. Update sender `last_seen_at`. Log filter action.
**Outputs:** `{ conversationId }`. Errors: `NotFound`, `Unauthorized`, `PhoneVerificationRequired`, `ContentBlocked`, `AlreadyExists`(→returns existing).

### Action 2: `sendMessage`
**Inputs:** `conversationId` (req), `content` (req).
**Validation/process:**
1. Authenticated; **`isPhoneVerified`**.
2. Conversation exists + user is participant (RLS also enforces).
3. Content 1–2000 chars; non-empty.
4. D-110 filter; `block` → `ContentBlocked` (reason); `warn` → `metadata.contains_warning=true`.
5. Insert `messages` row.
6. Bump `conversations.last_message_at = now()`, set `last_message_type`.
7. Update sender `last_seen_at`. Log filter action.
**Outputs:** `{ messageId, containsWarning? }`. Errors: `NotFound`, `Unauthorized`, `PhoneVerificationRequired`, `ContentBlocked`, `TooLong`, `Empty`.

### Action 3: `listConversations`
**Inputs:** `role?` (`buyer`/`seller`/`all`, default all), `limit?` (def 20, max 50), `cursor?`.
**Process:** conversations where user is buyer OR seller (or role-filtered); **sort by `last_message_at DESC`** (nulls last); per row fetch other-party (name, verification, last_seen_at), listing (title, price, primary image, status), last-message preview (≤80 chars), and **unread count = `COUNT(messages WHERE conversation_id=$ AND sender_id<>me AND read_at IS NULL)`**. Update `last_seen_at`. Avoid N+1 (batch/join).
**Output:** summaries + cursor.

### Action 4: `getMessages`
**Inputs:** `conversationId` (req), `limit?` (def 50, max 100), `before?` (message id).
**Process:** participant check; fetch messages by `conversation_id` ordered `created_at DESC` + limit; reverse for display; **mark read: `UPDATE messages SET read_at=now() WHERE conversation_id=$ AND sender_id<>me AND read_at IS NULL`**; update `last_seen_at`.
**Output:** messages (+ metadata) + `hasMore`.

### Action 5: `markConversationAsRead`
**Inputs:** `conversationId` (req).
**Process:** participant check; **`UPDATE messages SET read_at=now() WHERE conversation_id=$ AND sender_id<>me AND read_at IS NULL`**; update `last_seen_at`.
**Output:** `{ ok: true }`.

> Read-tracking note: per-message `read_at` + `messages_unread_idx` + the `messages_party_update` RLS policy are the deployed model. There are **no** `buyer_last_read_at`/`seller_last_read_at` columns.

## UI components
(Unchanged in intent from the original spec — `ConversationList` + `ConversationRow` at `/messages`; `MessageThread` + `MessageBubble` at `/messages/[conversationId]`; `MessageComposer` with template selector + char counter + send-on-Enter; `SafetyNudge` inline above composer, stronger copy for high-value categories; loading/empty/error/sending states; Realtime append + reorder; mark-as-read on thread mount. Verification-badge display is Stage 2.C.)

Safety nudge copy: *"Keep negotiation here so there's a record. Avoid paying before inspection."* High-value categories: *"This is a high-value item. Always inspect before payment. ShowMePrice doesn't hold transaction funds."*

Template options (D-108): "Is this still available?" · "What's your best price?" · "Can we negotiate on price?" · "Where is the item located?" · "Custom message".

## File structure
```
src/app/messages/page.tsx                       # ConversationList route
src/app/messages/[conversationId]/page.tsx      # MessageThread route
src/app/listings/[id]/MessageSellerButton.tsx   # temporary minimal trigger (Stage 2.B)
src/lib/messaging/actions.ts                     # server actions
src/lib/messaging/types.ts                       # types
src/lib/messaging/realtime.ts                    # realtime helpers
src/lib/messaging/filters.ts                     # D-110 filter integration
src/components/messaging/{ConversationList,ConversationRow,MessageThread,MessageBubble,MessageComposer,TemplateSelector,SafetyNudge}.tsx
migrations/E.2.5.0-profiles-last-seen-at.sql     # Commit 1 (DB-first)
```

## Implementation order (7 commits)
1. **Server actions foundation** — **E.2.5.0 migration (`profiles.last_seen_at`, DB-first §0/§1/§2)** → `src/lib/messaging/{actions,types,filters}.ts`: `createConversation`, `sendMessage`, `listConversations`, `getMessages`, `markConversationAsRead`; D-110 filter integration; phone-verified gate (D-114); `last_seen_at` writes; typecheck + `pnpm build`.
2. **Conversation list UI** — `/messages`, `ConversationList`/`ConversationRow`, loading/empty.
3. **Message thread UI** — `/messages/[conversationId]`, `MessageThread`/`MessageBubble`, `getMessages` + `markConversationAsRead`.
4. **Message composer** — `MessageComposer`, `sendMessage`, send-on-Enter, template selector (D-108), filter-error display.
5. **Realtime integration** — `realtime.ts`, subscribe in list + thread, optimistic merge, reconnection.
6. **Safety nudges + polish** — `SafetyNudge`, high-value detection, mobile responsive.
7. **Minimal MessageSellerButton** — temporary trigger on listing detail wiring `createConversation` (full Stage 2.C treatment later).

## Acceptance criteria (definition of done)

### Functional
Buyer starts conversation from listing detail · existing conversation returned for dup (buyer/seller/listing) · buyer cannot message own listing · buyer & seller can exchange messages · non-participant blocked (RLS) · **non-phone-verified users rejected with `PhoneVerificationRequired`** · banned phrase (`block`) blocked with reason · warn phrase sent + flagged (`metadata.contains_warning`) · list sorted by `last_message_at` · **unread count via per-message `read_at`** accurate · mark-as-read sets `messages.read_at` · Realtime new message in thread <2s · Realtime bumps list · template populates first message + `metadata.template_id` stored · `last_seen_at` updates on activity.

### UX
Loading/empty/error states · filter-block errors show specific reason · safety nudge in every thread (stronger for high-value) · **unverified users prompted to verify before composer** · mobile responsive @375px · keyboard nav (Enter sends) · send disabled when empty/over-limit · char counter.

### Technical (adjusted per decision 3 — no synthetic test harness yet)
- TypeScript strict passes · all server actions have proper error handling · ESLint passes · **`pnpm build` succeeds** (the production gate — per the banked MEMORY lesson).
- **All server actions tested manually in dev before commit.**
- **Production smoke test confirms behavior after each commit.**
- **Edge cases (filter blocks, RLS denials, race conditions) verified in dev.**
- *Selective exception:* the **filter integration** (`filters.ts`) is high-consequence (a missed `block` leaks contact info off-platform) — targeted `vitest` for the filter matcher is acceptable if it doesn't pull in broader test infrastructure. Agent judgment.
- Realtime subscriptions cleanly unsubscribe on unmount · optimistic updates don't double-render on Realtime confirm.

### Performance
List <1s · thread <1s · send round-trip <500ms · Realtime <2s (typical).

## Risk acknowledgment
Realtime subscription leaks (unmount cleanup) · N+1 in list (batch/join) · optimistic/Realtime race (idempotent merge) · filter false positives incl. K-029 NUBAN-on-prices (private beta surfaces these) · iOS Safari sticky-composer keyboard.
Non-engineering: users attempt off-platform contact (D-110 catches obvious; admin moderation the rest) · D-114 phone gate enforced server-side.

## Handoff notes
- D-104 commit-message format. Surface findings to planner **after each commit**; no silent bundling.
- §0 pre-flight discipline on the **E.2.5.0** migration (DB-first; Frank runs §0→§1→§2, paste-back, then the code commit).
- Deferred to later stages: verification badges / trust box / price-required (2.C), reporting (2.E), contact reveal (2.F), tiered listing access (Stage 4), Paystack (3.A).
