# PHASE E SPECIFICATION — ShowMePrice.ng

**Project:** ShowMePrice.ng v2 (https://showmeprice-ng-v2.pages.dev)
**Phase:** E — Buyer-Side Infrastructure + Pro Monetization
**Document version:** 1.1 (Sprint 1 monetization reconciliation)
**Predecessor phase:** D (shipped — 25 commits across categories, images, CRUD, search)
**Local repo:** `C:\Users\fasat\showmeprice-ng-v2\`

> **Spec revision note (v1.0 → v1.1):** Substantial monetization-related updates applied per **D-082 through D-091** (escrow restructure, no Premium Buyer tier, Pro Buyer reveal caps, mobile money channels, seller monetization deferred to Phase F). Earlier monetization framing in this spec has been corrected. The canonical monetization reference is now `MONETIZATION-PLAN.md`. See `DECISIONS.md` for the full rationale chain.

---

## 1. STRATEGIC POSITIONING (LOCKED)

> **ShowMePrice is not the biggest marketplace. It is the most trusted direct-trade marketplace for serious buyers and verified sellers in Nigeria.**

This sentence sits at the top of every design rationale. Every Phase E feature, every copy decision, every UX trade-off must serve this positioning.

**The strategic path:** classifieds first (Phase D, shipped) → trust layer second (Phase E, this spec) → fulfillment later (Phase G+).

**Tier roadmap committed** (per D-082):
- **Free Buyer** — Phase E. Escrow pay-per-use available at standard 1.5% + ₦100. 1 signup-grant free contact reveal (D-084).
- **Pro Buyer** — Phase E. ₦5,000/mo (₦3,000/mo launch promo first 3 months, D-087). Contact reveal + SMS + Pro badge + 1.2% discounted escrow rate (D-086) + tiered reveal cap (D-083).
- **Diaspora Buyer** — Phase E (gated on Phase G logistics for delivery coord). $15/mo. USD payment, recipient verification.
- **Institution Buyer** — Phase H+. Custom plans, multi-seat, dedicated support.

**Marketing positioning principle:** "Pro helps buyers reach sellers faster *and* transact safer." (Single tier consolidates both speed and protection benefits per D-082.)

All Pro-related copy throughout Phase E uses the **service for serious buyers** frame, never the **paywall** frame.

---

## 1.5 MONETIZATION PLAN v2.0 REFERENCE

The canonical, locked v2.0 monetization plan is documented in `MONETIZATION-PLAN.md` at repo root. This Phase E spec defers to that document for all pricing, tier definitions, escrow fee mechanics, credit pack structure, launch promo, and seller monetization deferral. Summary anchors below — if anything in this spec conflicts with `MONETIZATION-PLAN.md` or with the D-082–D-091 decision bank, the monetization plan and decisions win.

**Buyer monetization (Phase E):**
- **Pro subscription:** ₦5,000/mo · ₦45,000/yr. Launch promo ₦3,000/mo first 3 months (D-087).
- **Credit packs** (D-085): Trial ₦500/1 reveal · Small ₦1,500/3 · Medium ₦3,500/9 · Large ₦7,000/20.
- **Signup grant** (D-084): every new buyer gets 1 free reveal at signup; no Pro trial.
- **Reveal caps** (D-083): 10/day new Pro (<30d), 25/day established Pro (30+d, no open reports), bounded-by-credits for credit-pack users.

**Escrow (Phase E, D-082, D-086):**
- Pay-per-use, available to all buyers — not a Premium tier.
- Standard rate: 1.5% + ₦100. Pro Buyer discounted rate: 1.2% + ₦100. ₦50,000 minimum threshold.
- Server-side fee recomputation (per D-086; client values never trusted).

**Seller monetization:** Deferred to Phase F (D-091). Phase E ships seller foundation only — see §16 with Phase-target markers.

**Payment infrastructure** (D-090): Paystack channels include card, bank_transfer (covers OPay/PalmPay/Kuda/MoniePoint), USSD, mobile_money. Not card-only.

**Founding Seller offer** (D-088): First 100 verified sellers get permanent badge + 6 months free Pro Seller (period starts at Phase F launch) + grandfathered ₦7,500/mo Pro Seller pricing for life.

---

## 2. STACK & WORKING CONVENTIONS

**Stack:**
- Next.js 14 App Router
- Cloudflare Pages Edge runtime
- Supabase Postgres + Auth + Storage + Realtime
- Drizzle ORM
- @supabase/ssr for session handling
- pnpm 9.15.9 + Node 20

**Existing patterns to preserve:**
- All canonical docs in repo: `ACTUAL_SCHEMA.md`, `DECISIONS.md` (D-001 through D-053), `MEMORY.md`, `KNOWN_ISSUES.md`
- Continue logging architectural decisions in `DECISIONS.md` (Phase E uses D-054 onwards)
- Smoke test plan per section before moving to next

---

## 3. PHASE E PREREQUISITES (MUST SHIP BEFORE OR EARLY IN PHASE E)

### K-011: PKCE cross-browser email confirmation bug

Carried over from `KNOWN_ISSUES.md`. Buyer email confirmation flow breaks when the user clicks the confirmation link in a different browser than where they signed up. PKCE flow expects same-browser session continuity.

**Resolution required before buyer auth ships.** Two-pronged fix:
1. Switch email confirmation flow to OTP-style (server-stored code, no PKCE dependency) for the email-confirmation path specifically
2. Keep PKCE for OAuth-style flows when they're added Phase F+

This must be resolved as the **first** task in Phase E because all buyer auth depends on it.

### D-037: Contact filtering on listing descriptions

Carried over from `DECISIONS.md`. The PII filter rules designed in §10 below apply equally to listing descriptions, not just messages. Sellers cannot put WhatsApp numbers, bank accounts, payment links, etc. in their listing description text.

**Implementation:** same filter rules, same Pro bypass rules (with one exception: listing descriptions are public, so even Pro sellers cannot put WhatsApp links in descriptions — that's a messaging-only Pro feature).

---

## 4. BUYER AUTHENTICATION

### Decision summary
**Phone-primary OTP via Termii, password required, email optional with prominent prompt, display_name required, full_name and state_id optional.**

### Buyer signup flow

1. Buyer arrives at signup page (from listing page CTA "Message seller" or any Pro upgrade prompt)
2. Inputs:
   - **Phone number** (required, Nigerian format: 080x/081x/070x/090x/091x — validate strictly)
   - **Password** (required, min 8 chars, standard strength rules)
   - **Display name** (required, 2-50 chars, used in conversations and on buyer profile)
   - **Email** (optional, with prominent prompt: "Add email for receipts and account recovery (recommended)")
   - **State** (optional dropdown from existing states table)
   - **Full name** (optional)
3. Phone OTP sent via Termii (6-digit numeric, 10-minute expiry)
4. Buyer enters OTP → account created → logged in
5. If email was provided: send email confirmation via OTP-style code (not PKCE link) — links remain valid 24 hours
6. If email was provided and confirmed: `verification_status` array gains `email_verified`

### Termii integration
- Use Termii's transactional SMS API
- Sender ID: `ShowMePrice` (register with Termii)
- OTP message template: `"Your ShowMePrice code is {{otp}}. Valid for 10 minutes. Don't share this code."`
- Rate limiting: max 3 OTP requests per phone per hour, max 10 per phone per day
- Failed OTP attempts: max 5 tries per OTP before requiring a new OTP

### Schema additions to buyer profiles
```sql
-- Extends existing profiles table
ALTER TABLE profiles ADD COLUMN verification_status TEXT[] DEFAULT '{}';
-- Possible values: 'phone_verified', 'email_verified', 'google_verified',
-- 'facebook_verified', 'bvn_verified' — Phase E only sets phone/email

ALTER TABLE profiles ADD COLUMN auth_providers TEXT[] DEFAULT '{}';
-- Tracks which methods are linked: ['termii_phone'] in Phase E,
-- adds 'google', 'facebook' in Phase F+

ALTER TABLE profiles ADD COLUMN display_name TEXT NOT NULL;
ALTER TABLE profiles ADD COLUMN full_name TEXT; -- nullable
ALTER TABLE profiles ADD COLUMN state_id UUID REFERENCES states(id); -- nullable
ALTER TABLE profiles ADD COLUMN phone TEXT NOT NULL UNIQUE;
-- Email already exists from Supabase Auth, but make nullable
```

### Deferred to Phase F+
- Google OAuth signup
- Facebook OAuth signup
- International phone numbers
- BVN verification for high-value transactions

### Smoke test
- New buyer signs up with phone-only → OTP delivered within 30 seconds → account active
- New buyer signs up with phone + email → both OTPs delivered → both verifications complete
- Buyer tries non-Nigerian phone format → rejected with clear error
- Rate limit hit → clear error explaining retry window
- K-011 regression check: email confirmation works in different browser

---

## 5. BUYER PROFILE & DATA

### Phase E buyer profile fields
- `phone` (required, Nigerian format, unique)
- `password` (required, hashed via Supabase Auth)
- `email` (optional, unique if set)
- `display_name` (required)
- `full_name` (optional)
- `state_id` (optional)
- `verification_status` array (tracks completed verifications)
- `auth_providers` array (tracks linked methods)
- `tier` (enum: `free` | `pro` | `premium` | `institution` — Phase E uses `free` or `pro` only)
- `tier_started_at` (timestamp)
- `tier_expires_at` (nullable timestamp — null for free, set for Pro)
- `created_at` (timestamp)

### Empty-schema tables (created in Phase E, no data populated)
```sql
-- Phase G+ fulfillment
CREATE TABLE shipping_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  full_name TEXT,
  phone TEXT,
  street_address TEXT,
  city TEXT,
  state_id UUID REFERENCES states(id),
  postal_code TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phase H+ enhanced verification
CREATE TABLE kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  document_type TEXT, -- 'bvn', 'nin', 'passport', etc.
  document_reference TEXT,
  verification_status TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### User tier history
```sql
CREATE TABLE user_tier_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  from_tier TEXT,
  to_tier TEXT,
  reason TEXT, -- 'upgrade', 'downgrade', 'cancellation', 'refund', 'admin_action'
  amount_paid_kobo BIGINT,
  payment_id UUID REFERENCES payments(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. SAVED LISTINGS (BOOKMARKS)

### Decision summary
Phase E ships bookmarks-only. Notes, price alerts, and cart semantics are deferred — but the schema accommodates them now to avoid migrations later.

### Schema
```sql
CREATE TABLE saved_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID REFERENCES profiles(id) NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  note TEXT, -- nullable, Phase F+ adds notes
  alert_price_threshold BIGINT, -- nullable, Phase F+ price alerts
  quantity INTEGER, -- nullable, Phase G+ cart semantics
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (buyer_id, product_id)
);
```

### Behavior
- Bookmark button on every listing card and listing detail page
- "My Saved Listings" page accessible from buyer profile
- Sold or deleted listings remain in saved list but show greyed-out with status indicator
- No limits on saved listings count in Phase E (free or Pro)

### Price history table (Phase E logs, Phase F+ surfaces)
```sql
CREATE TABLE price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id),
  price_kobo BIGINT,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changed_by UUID REFERENCES profiles(id)
);

-- Trigger on products.price_kobo update writes to price_history
```

### Deferred to Phase F+
- Notes on saved listings
- Price drop alerts (uses `alert_price_threshold` + `price_history`)
- Saved searches (separate table — see §15)

### Smoke test
- Buyer saves a listing → appears in "My Saved Listings"
- Seller marks listing sold → appears greyed-out in buyer's saved list
- Seller deletes listing → appears greyed-out with "removed by seller" indicator
- Bookmark/unbookmark from listing detail page works

---

## 7. MESSAGING SYSTEM

### Decision summary
WhatsApp-style real-time chat with typing indicators, read receipts, image attachments. Supabase Realtime for delivery. Buyer-initiated only. One conversation per (buyer, seller, listing).

### Conversation model
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID REFERENCES profiles(id) NOT NULL,
  seller_id UUID REFERENCES profiles(id) NOT NULL,
  listing_id UUID REFERENCES products(id) NOT NULL,
  conversation_type TEXT NOT NULL DEFAULT 'buyer_seller',
  -- Future values: 'admin_user' (Phase F+), 'seller_buyer_fulfillment' (Phase G+)
  status TEXT DEFAULT 'active',
  -- 'active', 'archived', 'listing_sold', 'listing_deleted'
  last_message_at TIMESTAMPTZ,
  last_message_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique constraint allows future conversation types without buyer/seller/listing
CREATE UNIQUE INDEX conversations_buyer_seller_listing_unique
  ON conversations (buyer_id, seller_id, listing_id)
  WHERE conversation_type = 'buyer_seller';
```

### Message model
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) NOT NULL,
  sender_id UUID REFERENCES profiles(id) NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  -- 'text' (Phase E), 'image' (Phase E), 'voice_note' (Phase F+),
  -- 'offer' (Phase F+), 'system' (admin messages, Phase F+)
  content TEXT,
  metadata JSONB DEFAULT '{}',
  -- Voice note duration, offer amount, image dimensions, etc.
  attachment_url TEXT, -- Supabase Storage URL for images
  read_at TIMESTAMPTZ, -- null until recipient reads
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Real-time delivery
- Supabase Realtime subscription on conversations and messages
- Typing indicators: ephemeral, broadcast via Supabase Realtime presence, not stored
- Read receipts: when recipient opens conversation, all unread messages get `read_at` updated
- Online status: presence-based, visible to other party in conversation header

### Image attachments
- Buyer or seller can attach images to messages
- Use existing Supabase Storage `product_images` bucket pattern with RLS
- Max image size: 5MB
- Max images per message: 4
- Image previews shown inline in conversation

### Conversation initiation
- Only buyers can initiate conversations
- Buyer clicks "Message Seller" on listing detail page → conversation created with `listing_id` reference
- If conversation already exists for this (buyer, seller, listing), it opens the existing one
- Sellers can only reply to existing conversations, never initiate

### Conversation persistence
- Listing sold → conversation status changes to `listing_sold` but messages remain accessible
- Listing deleted → conversation status changes to `listing_deleted` but messages remain accessible
- Listing description shows in conversation header even after sold/deleted

### Message reactions (empty schema, Phase F+)
```sql
CREATE TABLE message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id),
  user_id UUID REFERENCES profiles(id),
  reaction TEXT, -- 'thumbs_up', 'thumbs_down', etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (message_id, user_id, reaction)
);
```

### Image analysis (empty schema, Phase G+ OCR)
```sql
CREATE TABLE message_image_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id),
  ocr_text TEXT,
  detected_phone_numbers TEXT[],
  detected_bank_accounts TEXT[],
  analysis_status TEXT,
  analyzed_at TIMESTAMPTZ
);
```

### Deferred to Phase F+
- Voice notes
- Stickers / GIFs
- Message reactions
- Structured offers

### Smoke test
- Buyer messages seller → message delivered in <1 second
- Both sides see typing indicators
- Read receipts update when recipient opens conversation
- Image attachment uploads and renders in conversation
- Conversation persists after listing marked sold

---

## 8. SELLER MESSAGING UX

### Decision summary
In-app only (no email reply path). Email notifications drive sellers back to the app via deep links from `noreply@showmeprice.ng`. Mobile-first design.

### Seller inbox
- Grouped by listing — each listing shows its conversations underneath
- Per conversation row shows: buyer display_name, last message preview, time, unread count, **Pro badge** if buyer is Pro, online status indicator
- **Pro buyer conversations sort above free buyer conversations** within each listing group, labeled "Pro buyer inquiry"
- Quick filters: All / Unread / Pro buyers / This listing only

### Conversation header (seller view)
Shows buyer profile inline:
- Pro Buyer badge (if Pro)
- Phone verified · Email verified (if applicable) · State · Joined [Month Year]
- Online status

### Quick replies (Nigerian-flavored templates)
Default templates available with one tap:
- "Yes still available"
- "Price is negotiable, send your best offer"
- "Located in [seller's state]"
- "Can deliver within [city] for extra fee"
- "Cash on delivery available"
- "Brand new in box, sealed"
- "Available for inspection"
- "Send me your offer"

Sellers can customize/add their own templates.

### Mark as sold workflow
- "Mark as Sold" button accessible from conversation header
- Triggers confirmation: "Mark this listing as sold to {buyer_name}?"
- On confirm: listing status changes to `sold`, conversation status changes to `listing_sold`, both parties get notification, conversation persists

### Seller dashboard additions
Reply rate calculation: % of buyer-initiated messages the seller responded to within 24h (rolling 30-day window). Shown publicly on seller profile as trust signal.

### Smoke test
- Seller receives buyer message → email notification within 1 minute
- Seller clicks email → deep links to conversation in app
- Pro buyer conversations sort above free buyer conversations
- Quick reply templates work with one tap
- Mark as Sold triggers listing status change and notifies buyer

---

## 9. NOTIFICATIONS

### Decision summary
- **Free buyers:** in-app + email (with batching and smart rules)
- **Pro buyers:** adds SMS via Termii
- **Sellers:** in-app + email always
- **Browser push:** deferred to Phase F+

### Notification events
```sql
CREATE TYPE notification_event AS ENUM (
  'new_message',
  'seller_reply',
  'listing_sold',
  'price_drop',
  'verification_status_change',
  'pro_renewal_upcoming',
  'pro_renewal_succeeded',
  'pro_renewal_failed',
  'pro_subscription_ending',
  'report_action_taken',
  'admin_message',
  'listing_reported',
  'listing_hidden'
);
```

### Schema
```sql
CREATE TABLE notification_preferences (
  user_id UUID REFERENCES profiles(id),
  event_type notification_event,
  in_app_enabled BOOLEAN DEFAULT TRUE,
  email_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT FALSE,
  push_enabled BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (user_id, event_type)
);

CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  event_type notification_event,
  channel TEXT, -- 'in_app', 'email', 'sms', 'push'
  subject TEXT,
  body TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  provider_reference TEXT -- Termii message ID, email provider ID, etc.
);

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  endpoint TEXT,
  keys JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Empty in Phase E; Phase F+ populates for browser push
```

### Email batching rules
- Multiple notifications to same user within 10 minutes → batch into single email
- Subject lines specific to content: "New message from {seller_name} about your inquiry on {listing_title}"
- One-click unsubscribe in every email footer (per-event-type, not all-or-nothing)
- Send from `noreply@showmeprice.ng`

### SMS notifications (Pro buyers only)
- Use Termii transactional SMS API
- Sent for: `new_message`, `seller_reply`, `pro_renewal_failed`
- Cost-aware: max 5 SMS per buyer per day to prevent runaway costs
- Sender ID: `ShowMePrice`

### In-app notification center
- Bell icon in header with unread count
- Notifications page lists last 30 days
- Click notification → deep link to relevant context (conversation, listing, profile)

### Smoke test
- Free buyer receives new message → in-app + email within 1 minute, no SMS
- Pro buyer receives new message → in-app + email + SMS within 1 minute
- Email batching: send 3 messages within 10 min → single batched email
- Unsubscribe link works per event type

---

## 10. PII FILTER

### Decision summary
Three-tier filter, Nigerian-tuned. Admin-editable rules. Applies to both messages AND listing descriptions (D-037 carryover).

### Filter tiers
| Content type | Free buyer | Pro buyer | Listing description |
|---|---|---|---|
| Normal text | Allowed | Allowed | Allowed |
| Phone number | Soft warning + allow | Allowed | Blocked |
| WhatsApp/Telegram/Signal links | Hard block + Pro upgrade prompt | Allowed | Blocked |
| NUBAN bank account (10-digit) | Hard block | Hard block (until escrow Phase G+) | Blocked |
| Payment links / processor URLs | Hard block | Hard block | Blocked |
| Shortened URLs (bit.ly, tinyurl) | Hard block | Hard block | Blocked |
| Email address | Hard block | Hard block | Blocked |
| Social handles (@username, instagram.com/) | Soft warning + allow | Allowed | Blocked |

### Soft warning UX
On first attempt to send a phone number, buyer sees a one-time educational screen:
> **Stay safe on ShowMePrice**
>
> Sharing your phone number means moving the conversation outside our platform, where we can't protect you. Most scams happen after buyers leave ShowMePrice to chat on WhatsApp.
>
> If you're a serious buyer, **upgrade to Pro** to access seller WhatsApp directly through verified contact reveal — no phone sharing in chat needed.
>
> [Send anyway] [Upgrade to Pro] [Cancel]

### Hard block UX
Message shows: "This message contains contact info that's blocked to protect both parties. Pro buyers can share contact info directly. [Learn more] [Upgrade to Pro]"

### Schema
```sql
CREATE TABLE filter_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type TEXT NOT NULL, -- 'phone', 'whatsapp_link', 'bank_account', etc.
  pattern TEXT NOT NULL, -- regex
  action TEXT NOT NULL, -- 'block', 'warn', 'allow'
  applies_to_tier TEXT[], -- ['free'] for soft-warn-then-allow on free
                          -- ['free', 'pro'] for blocks that apply to everyone
  applies_to_context TEXT[], -- ['message', 'listing_description']
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE filter_actions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  context TEXT, -- 'message', 'listing_description'
  context_id UUID, -- message_id or product_id
  rule_id UUID REFERENCES filter_rules(id),
  rule_action TEXT, -- what the rule did
  original_content TEXT,
  user_proceeded BOOLEAN, -- did they send anyway after soft warning
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Initial filter rules (seed data)
- Nigerian phone format regex: `(?:\+?234|0)(70|80|81|90|91)\d{8}`
- WhatsApp links: `(wa\.me|api\.whatsapp\.com|whatsapp\.com)`
- Telegram links: `(t\.me|telegram\.me)`
- NUBAN: `\b\d{10}\b` (with context filter to avoid false positives on prices)
- Email: standard email regex
- Shortened URLs: `(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly)`
- Social handles: `(@\w+|instagram\.com\/|facebook\.com\/|twitter\.com\/|x\.com\/)`
- Payment URLs: `(paystack\.com\/pay|flutterwave\.com\/pay|monnify\.com\/pay)`

### Price/negotiation whitelist
Filter must NOT flag legitimate negotiation language:
- `₦450,000`, `₦450k`, `450k`, `450 thousand`, `N450k`, `NGN 450,000`
- `last price`, `last last`, `final offer`, `negotiable`, etc.

### Admin-editable rules
Rules table is admin-editable from the admin moderation dashboard. Pattern, action, tier targeting, and context targeting all configurable without code changes.

### Smoke test
- Free buyer sends "Call me on 08012345678" → soft warning shown, can proceed
- Free buyer sends "WhatsApp me on wa.me/2348012345678" → hard block
- Pro buyer sends WhatsApp link → allowed
- Anyone sends NUBAN-like 10-digit number → hard blocked even for Pro
- "Last price ₦450k" → not flagged (negotiation language)
- Filter rule edited in admin → takes effect immediately without deploy

---

## 11. PRO TIER PRICING & FEATURES

### Pricing structure (LOCKED)

**Credit packs** (one-time, 6-month expiry on credits):
| Pack | Price | Credits |
|---|---|---|
| Small | ₦1,500 | 3 reveals |
| Medium | ₦3,500 | 9 reveals |
| Large | ₦7,000 | 20 reveals |

**Subscriptions** (auto-renewing, tiered daily reveal cap per D-083 — 10/day new Pro under 30 days, 25/day established Pro with no open reports):
| Plan | Standard price | Launch promo price |
|---|---|---|
| Monthly | ₦5,000/month | ₦3,000/month |
| Annual | ₦45,000/year | ₦27,000/year |

### Launch promo mechanics
- **Duration:** 3 months from Pro tier go-live date
- **Mechanic:** discount on signup during the 3-month window
- **Monthly subscribers from promo:** auto-renew at ₦5,000 after their first month (no grandfather)
- **Annual subscribers from promo:** complete 12-month term at ₦27,000, then renew at ₦45,000
- **Credit pack prices unchanged** during promo
- **End date displayed prominently** on pricing page during promo

### Save mechanism for monthly cancellers
14 days before first renewal at the new price (₦5,000), email sent to promo monthly subscribers:
> "Your Pro subscription renews on [date] at ₦5,000/month. Lock in launch pricing for the year by switching to annual at ₦27,000 (save ₦33,000)."

### Pro tier features (FINAL LIST)

1. **Contact reveal** on listing pages
   - One-click reveal of seller WhatsApp number + phone number
   - Direct WhatsApp button (deep link)
   - Direct call button (tel: link)
   - First reveal shows one-time educational screen about trust positioning

2. **Relaxed PII filter** in messaging
   - WhatsApp/Telegram/Signal links allowed
   - Social handles allowed without warning
   - Bank accounts still blocked (until escrow Phase G+)

3. **SMS notifications** via Termii for new messages and seller replies

4. **Pro buyer badge** visible to sellers
   - Shows in conversation header
   - Shows in seller inbox listing
   - Shows on buyer profile card

5. **Priority inbox placement**
   - Pro buyer conversations sort above free buyer conversations in seller inboxes
   - Labeled "Pro buyer inquiry"

6. **Revealed Contacts history page**
   - Buyer's archive of all sellers they've unlocked
   - Shows: product title, seller name, verification badge, date revealed, WhatsApp/call buttons, conversation link
   - Filterable, searchable

7. **Enhanced buyer profile shown to sellers**
   - Format: "Pro Buyer · Phone verified · Email verified · Lagos · Joined May 2026"
   - Visible in seller inbox and conversation header

8. **Higher conversation/message limits** (architectural foundation)
   - Tracked but not enforced in Phase E
   - Phase F+ enforces limits per tier

9. **Credit balance / subscription status** visible in buyer header and profile

### Pro feature schema
```sql
CREATE TABLE tier_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier TEXT NOT NULL, -- 'free', 'pro', 'premium', 'institution'
  feature_key TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  metadata JSONB,
  UNIQUE (tier, feature_key)
);

-- Seed in Phase E: free row + pro row
-- Phase G+ adds: premium row
-- Phase H+ adds: institution row
```

### Revealed contacts tracking
```sql
CREATE TABLE contact_reveals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID REFERENCES profiles(id),
  seller_id UUID REFERENCES profiles(id),
  listing_id UUID REFERENCES products(id),
  revealed_at TIMESTAMPTZ DEFAULT NOW(),
  credit_used BOOLEAN DEFAULT FALSE,
  -- True if reveal consumed a credit; False if via subscription
  payment_id UUID REFERENCES payments(id)
);
```

### Marketing copy guidelines

**Pro tier landing page headline:**
> "Stand out to sellers. Reach them faster."

**Subhead:**
> "Pro helps serious buyers reach verified sellers directly — through WhatsApp, phone, and priority placement in seller inboxes."

**Pricing page bullets:**
- "Reveal seller WhatsApp and phone — one click"
- "Show sellers you're a serious buyer with the Pro badge"
- "Get SMS alerts when sellers reply"
- "Keep a history of every seller you've connected with"
- "First access to buyer protection features as they launch"

**Avoid:**
- "Pay to message sellers" (false — free buyers can message)
- "Sellers reply faster to Pro buyers" (we can't guarantee seller behavior)
- "Paywall" framing of any kind

### Smoke test
- Buyer purchases credit pack → credits reflected in balance immediately
- Pro monthly subscription starts → all Pro features unlocked
- Contact reveal consumes credit (or works free for subscription Pro)
- Revealed Contacts page shows all past reveals
- Pro badge appears in seller's inbox view

---

## 12. PAYSTACK INTEGRATION

### Decision summary
Paystack as primary processor. Full integration: one-time + recurring + management UI. Direct Debit support for Nigerian buyers without cards. Card management via Paystack's hosted page.

### Paystack Plans configuration
4 plans created in Paystack dashboard:
| Plan name | Code reference | Amount | Interval | Invoice limit |
|---|---|---|---|---|
| Pro Monthly Launch | `pro_monthly_launch` | ₦3,000 | monthly | 3 |
| Pro Monthly Standard | `pro_monthly_standard` | ₦5,000 | monthly | — |
| Pro Annual Launch | `pro_annual_launch` | ₦27,000 | annually | 1 |
| Pro Annual Standard | `pro_annual_standard` | ₦45,000 | annually | — |

### Payment provider abstraction
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  payment_provider TEXT NOT NULL DEFAULT 'paystack',
  -- Future: 'flutterwave' (Phase F+). Monnify was deprioritized per D-074;
  -- Paystack covers Phase E escrow per D-082. Korapay is the documented
  -- payment-gateway fallback per D-078, but its Phase E role is NIN
  -- verification (D-074), not payments.
  provider_transaction_id TEXT, -- Paystack reference
  amount_kobo BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  -- Future: 'USD', 'GBP' for Phase H+ international
  payment_type TEXT NOT NULL,
  -- 'credit_pack', 'subscription_initial', 'subscription_renewal', 'refund'
  status TEXT NOT NULL,
  -- 'pending', 'success', 'failed', 'refunded'
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  payment_provider TEXT NOT NULL DEFAULT 'paystack',
  provider_subscription_code TEXT,
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL,
  -- 'active', 'attention', 'non-renewing', 'completed', 'cancelled'
  started_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  payment_method TEXT, -- 'card', 'direct_debit'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE credit_balances (
  user_id UUID REFERENCES profiles(id) PRIMARY KEY,
  credits_available INTEGER DEFAULT 0,
  credits_purchased_at TIMESTAMPTZ,
  credits_expire_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Code abstraction
Create a `PaymentGateway` interface that wraps Paystack today (D-074, D-078). Korapay is the documented named fallback. Flutterwave or other Nigerian payment processors can be added in future phases behind the same interface without app-code changes. Monnify was originally on the Phase G+ escrow shortlist but was deprioritized per D-074.

```typescript
interface PaymentGateway {
  initializeTransaction(params: TransactionInitParams): Promise<TransactionInit>
  verifyTransaction(reference: string): Promise<TransactionStatus>
  createSubscription(params: SubscriptionParams): Promise<Subscription>
  cancelSubscription(code: string): Promise<void>
  initiateRefund(transactionId: string): Promise<RefundResult>
  handleWebhook(payload: any, signature: string): Promise<WebhookResult>
}
```

Phase E ships with `PaystackGateway implements PaymentGateway`. Phase F+ adds `FlutterwaveGateway`. Routing logic decides which to use per transaction.

### Webhook handlers (5 critical events)
1. `charge.success` — credit pack purchased → add credits, set expiry
2. `subscription.create` — Pro tier activated → set user tier, set period dates
3. `subscription.disable` — handle three sub-cases by status:
   - `cancelled` → user cancelled, tier active until period_end then deactivates
   - `completed` (with invoice_limit hit on Launch plan) → trigger migration to Standard plan
   - `complete` (full subscription term ended) → tier deactivates
4. `invoice.payment_failed` — card declined → enter 7-day grace period, send notification
5. `invoice.update` / `invoice.successful` — renewal succeeded → extend period

### Launch promo migration logic
When a `pro_monthly_launch` subscription hits `subscription.disable` with status `completed` (after 3 successful renewals):
1. Webhook handler detects launch plan completion
2. Creates a new subscription on `pro_monthly_standard` plan using the same payment authorization
3. Sends notification to user: "Your launch pricing has ended. You're now on the standard ₦5,000/month plan."
4. Updates user_tier_history with migration record

Same logic for annual: `pro_annual_launch` completing migrates to `pro_annual_standard`.

### Direct Debit support
- At subscription checkout, offer two payment paths:
  - "Pay with card"
  - "Pay with bank account (Direct Debit)"
- Direct Debit available for Nigerian subscriptions per Paystack documentation
- Both flows produce a Paystack authorization that powers recurring charges
- UI clearly explains: "Direct Debit allows ShowMePrice to debit your bank account on each renewal date. You can cancel anytime."

### Subscription management UI
Buyer profile section "Subscription & Billing" shows:
- Current plan name + price + status
- Next renewal date (or cancellation date if cancelling)
- Last 6 months of charges
- **Change card** button → deep links to Paystack's hosted subscription preferences page
- **Cancel subscription** button → confirmation flow with save offers
- **Upgrade to annual** button (monthly subscribers only) → cancels current, starts annual at next period
- **Request refund** button (active during first 14 days of annual subscription)

### Cancellation flow
1. Click "Cancel subscription"
2. Confirmation screen: "Are you sure? You'll lose access to [list of Pro features] on [period_end date]"
3. Save offer screen: "Stay for ₦3,000/month for the next 3 months" or "Switch to annual at ₦27,000 (one-year promo rate)"
4. If still cancels: mark `cancel_at_period_end = true`, Pro features remain active until period_end

### Refund handling (manual via admin)
1. Buyer clicks "Request refund" within 14-day window
2. System validates eligibility (subscription_started_at within 14 days)
3. Admin gets notification in moderation queue
4. Admin processes refund via Paystack dashboard manually
5. Admin marks refund completed in admin tool → user gets confirmation email
6. After 6 months of operation, evaluate automating

### Card decline grace period
- Card fails on renewal → Paystack auto-retries 3 times over 7 days (their default)
- During retry period: Pro features remain active (7-day grace)
- All retries fail → Pro tier deactivates, user notified to update card
- User updates card via Paystack hosted page → Pro reactivates on next renewal date

### Security
- Webhook signature verification (HMAC-SHA512) mandatory on every incoming webhook
- Webhooks must respond HTTP 200 OK within 30 seconds
- Paystack keys in Cloudflare Pages environment variables: `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET`
- Separate test mode keys for dev environment
- Live mode only after Phase E smoke tests pass on staging

### Deferred to Phase F+
- Automated refund processing
- Subscription proration
- Dunning email automation (rely on Paystack defaults)
- Expiring card proactive outreach
- Flutterwave secondary gateway for redundancy

### Deferred to Phase G+
- ~~Monnify integration for escrow workflows~~ — superseded per D-074 (Monnify deprioritized) and D-082 (escrow ships Phase E via Paystack). The Phase G+ escrow scope is now: dispute resolution automation, fulfillment-bundled escrow flows, and any additional payment-processor work as needed for Diaspora Buyer USD payments.
- Split payments for seller settlements

### Smoke test
- Buyer purchases credit pack via Paystack → credits added → webhook verified
- Buyer subscribes to Pro Monthly Launch → first charge succeeds → subscription active
- Wait for 3rd monthly renewal → launch plan completes → migration to Standard triggered → new subscription active at ₦5,000
- Cancel subscription → tier remains active until period_end → deactivates correctly
- Trigger card decline (test mode) → grace period activates → all retries fail → tier deactivates
- Refund request within 14 days → admin notified → admin processes → user confirmed

---

## 13. MODERATION: REPORTS + BLOCKS

### Decision summary
Reports + self-serve blocks. No auto-actions. Admin reviews all reports manually. Schema designed for Phase F+ case management expansion.

### Report types
- **Listing report:** report a product listing
- **User report:** report a buyer or seller
- **Message report:** report a specific message in a conversation

### Report reason taxonomy

**Listing reports:**
- "Item is fake or counterfeit"
- "Price is misleading"
- "Wrong category"
- "Item not as described"
- "Prohibited item"
- "Other" (with required description)

**User reports:**
- "Harassment"
- "Scam attempt"
- "Tried to move conversation off-platform"
- "Fake identity"
- "Spam"
- "Other" (with required description)

**Message reports:**
- "Contains scam content"
- "Harassment"
- "Inappropriate content"
- "Spam"
- "Other" (with required description)

### Schema
```sql
CREATE TYPE report_target_type AS ENUM ('listing', 'user', 'message');
CREATE TYPE report_status AS ENUM ('new', 'in_review', 'resolved', 'dismissed');

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES profiles(id) NOT NULL,
  target_type report_target_type NOT NULL,
  target_id UUID NOT NULL, -- listing_id, user_id, or message_id
  reason TEXT NOT NULL,
  description TEXT, -- optional, max 200 chars
  status report_status DEFAULT 'new',
  case_id UUID, -- nullable, Phase F+ case clustering
  created_at TIMESTAMPTZ DEFAULT NOW(),
  first_viewed_at TIMESTAMPTZ, -- when admin first opened it
  first_action_at TIMESTAMPTZ, -- when admin took first action
  resolved_at TIMESTAMPTZ
);

CREATE INDEX reports_target_idx ON reports(target_type, target_id);
CREATE INDEX reports_status_idx ON reports(status, created_at);

-- Rate limit: 1 report per reporter per (target_type, target_id) per 7 days
CREATE UNIQUE INDEX reports_rate_limit_idx
  ON reports(reporter_id, target_type, target_id)
  WHERE created_at > NOW() - INTERVAL '7 days';

CREATE TABLE blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID REFERENCES profiles(id) NOT NULL,
  blocked_id UUID REFERENCES profiles(id) NOT NULL,
  case_id UUID, -- nullable, Phase F+ case clustering
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX blocks_blocked_count_idx ON blocks(blocked_id);
```

### Block enforcement
- When buyer blocks seller (or vice versa), neither can message the other
- Seller's listings hidden from blocker's browsing/search results
- Blocker doesn't appear in blocked user's inbox
- Block reversible from blocker's profile settings
- Block does NOT automatically create a report (different intent)

### Report queue (admin view)
- All reports sorted by priority signals: recency, severity (multi-report patterns on same target), report type
- Filterable by: status, target_type, specific user, date range
- Per-report context view shows:
  - Report reason + description
  - Reporter's full history (joined date, verification, prior reports filed, prior reports against them)
  - Target's full history (listings, conversations volume, prior reports, block count, prior admin actions)
  - For message reports: full conversation thread with reported message highlighted
  - For listing reports: full listing detail + edit history
  - For user reports: profile + recent activity summary

### Admin actions
- **Dismiss** — no action taken, marks resolved with admin note
- **Warn user** — sends notification ("a recent action on your account was reviewed; please review our guidelines"), logged
- **Hide listing** — listing status changes to `hidden`, seller sees it's hidden with admin note, can be reversed
- **Suspend user** — durations: 1 day, 7 days, 30 days. User can't log in or transact. Reversible.
- **Ban user** — permanent. Account closed, listings hidden, conversations preserved for audit. Reversible only via direct admin action.
- **Email user** — opens email composer, sends from `support@showmeprice.ng`, content logged

### Block count surfacing
Separate admin dashboard view: users sorted by block count over various time windows. Surfaces fraud patterns independent of formal reports.

### Smoke test
- Buyer reports a listing → appears in admin queue within seconds
- Same buyer tries to report same listing again within 7 days → rate-limited error
- Buyer blocks seller → can no longer see seller's listings or messages
- Admin hides a listing → seller sees it's hidden with reason
- Admin suspends a user → user can't log in until suspension expires

---

## 14. ADMIN DISPUTE REVIEW TOOLING

### Decision summary
Dedicated admin moderation dashboard extending Phase C.5 admin panel. Email-based admin-to-user communication. Architectural additions for Phase F+ case management and multi-admin.

### Admin entity (separate from profiles)
```sql
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  admin_role TEXT NOT NULL DEFAULT 'super_admin',
  -- Phase E: only 'super_admin'
  -- Phase F+: 'moderator', 'support', 'finance', 'verifier'
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
```

### Admin action log
```sql
CREATE TABLE admin_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id) NOT NULL,
  target_type TEXT NOT NULL,
  -- 'listing', 'user', 'message', 'report', 'verification', 'subscription'
  target_id UUID NOT NULL,
  action TEXT NOT NULL,
  -- 'dismiss_report', 'warn_user', 'hide_listing', 'suspend_user',
  -- 'ban_user', 'verify_seller', 'reject_verification', 'refund',
  -- 'email_sent', etc.
  reason TEXT,
  notes TEXT, -- admin's free-form notes
  metadata JSONB,
  case_id UUID, -- nullable, Phase F+ case clustering
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX admin_action_log_target_idx
  ON admin_action_log(target_type, target_id);
CREATE INDEX admin_action_log_admin_idx
  ON admin_action_log(admin_id, created_at);
```

### Admin emails table
```sql
CREATE TABLE admin_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id),
  recipient_user_id UUID REFERENCES profiles(id),
  channel TEXT NOT NULL DEFAULT 'email',
  -- Phase E: 'email'
  -- Phase F+: 'in_app', 'sms'
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  case_id UUID, -- nullable, Phase F+ case clustering
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Email templates (admin tools)
- "Your listing was reported and reviewed"
- "Your listing has been hidden"
- "Your account is suspended"
- "Your account has been reinstated"
- "Please respond to a dispute"
- "Verification update"

Each template includes placeholders for user name, listing title, date, admin's reason. Admin can edit before sending.

### Phone-only users without email
If admin needs to reach a user who signed up phone-only without email:
- System sets a banner flag on the user's account
- Next time user logs in, banner shows: "Important message from ShowMePrice support. Please add an email to your account to receive it."
- User adds email → banner clears, admin notified to send the email
- No automated SMS-from-admin in Phase E (cost control)

### Block count dashboard
Separate admin view showing:
- Users sorted by block count (last 7 days, 30 days, all time)
- Click row → user's full profile + listings + recent reports
- Independent of report queue (block patterns surface even without formal reports)

### Deferred to Phase F+
- In-app admin-to-user messaging (currently email only)
- Case clustering and case state machine (schema ready, no UI)
- Multi-admin permissions and role enforcement (schema ready, only super_admin in Phase E)
- Admin SLA tracking dashboards
- Public-facing "admin reviewed" indicators on reports

### Smoke test
- Admin opens moderation dashboard → sees all open reports
- Admin opens a report → sees full context (reporter, target, conversation)
- Admin takes action (e.g., hide listing) → action logged + user notified
- Admin emails user via template → email sent + logged in admin_emails
- Phone-only user gets banner on next login when admin needs to reach them

---

## 15. SEARCH & ANALYTICS (PHASE E LOGGING)

### Search query logging
```sql
CREATE TABLE search_query_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id), -- nullable for anonymous searches
  query TEXT NOT NULL,
  category_id UUID REFERENCES categories(id), -- if filtered
  state_id UUID REFERENCES states(id), -- if filtered
  results_count INTEGER,
  first_click_position INTEGER, -- which result was clicked first (nullable)
  searched_at TIMESTAMPTZ DEFAULT NOW()
);
```

Phase E logs every search. Phase F+ surfaces insights:
- Most-searched terms with zero results (demand gaps)
- Most-searched terms by state (regional preference)
- Search-to-click conversion rate (search relevance)

### Saved searches (empty schema)
```sql
CREATE TABLE saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID REFERENCES profiles(id),
  query TEXT,
  category_id UUID REFERENCES categories(id),
  state_id UUID REFERENCES states(id),
  filters JSONB,
  alert_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
Empty in Phase E. Phase F+ ships as Pro buyer feature.

---

## 16. SELLER FEATURES — PHASE-TARGET MARKED

> **Phase scoping per D-091:** Phase E ships seller-side **foundation only** — no seller monetization, no paid features, no earned-trust signals requiring transaction data. The subsections below each carry a `[Phase E]` or `[Phase F]` / `[Phase F+]` marker. **Sprint 3 implementation work uses this section as the canonical scope reference via the markers below.**

> **Phase E Seller-Side Scope (D-091 summary):** Seller profile creation/edit · Listing creation with mandatory visible price · Verification application + admin review queue · Founding Seller badge infrastructure · Seller report/block tools · Mark-item-as-sold flow · In-app inbox structure. Phase E sellers retain unlimited listings (existing `businesses.seller_listing_limit` nullable=unlimited).

### Seller profile enrichment — `[Phase E]` core fields, `[Phase F]` reply rate

Sellers can configure on their profile:
- Profile photo / business logo (Supabase Storage) — **`[Phase E]`**
- Short business description (max 500 chars) — **`[Phase E]`**
- Default response time message ("Usually responds within 1 hour") — **`[Phase E]`**
- Total active listings count (auto-computed) — **`[Phase E]`**
- Verified-since date (auto-set on verification) — **`[Phase E]`**
- Reply rate (auto-computed, public) — **`[Phase F+]`** (needs accumulated conversation data; not surfaced in Phase E even though messages table exists)

### Reply rate calculation — `[Phase F+]`
Percentage of buyer-initiated messages the seller responded to within 24 hours, over a rolling 30-day window. Computed nightly. **Deferred to Phase F+** per D-091 — Phase E ships no transaction-history-derived trust signals; the messaging system runs in Phase E but reply-rate calculation, public surfacing, and use as a ranking/featured-seller-gating signal happen in Phase F+.

### Seller analytics — `[Phase F]`
**Deferred to Phase F** per D-091. Phase E ships no seller analytics dashboard. The materialized view scope (total listings, conversations, messages, reply rate, listings sold this month / all-time) is preserved here as a Phase F design reference; the implementation lands when Pro Seller subscription launches.

### Seller tier (architectural foundation) — `[Phase E]` schema, `[Phase F]` enforcement
```sql
-- Schema ships in Phase E.1.0 (already applied).
-- Phase E values: 'free', 'verified' (post-verification baseline).
-- Phase F+ adds 'pro_seller', 'premium_seller'; Phase G+ adds 'enterprise_seller'.
ALTER TABLE businesses ADD COLUMN seller_tier TEXT DEFAULT 'verified';

-- Phase E: null (unlimited). Phase F: Free Seller tier enforces 10 listings,
-- Pro Seller tier enforces 50 listings (per D-091).
ALTER TABLE businesses ADD COLUMN seller_listing_limit INTEGER;

-- Phase E: null (tracking only). Phase F: enforces per tier.
ALTER TABLE businesses ADD COLUMN seller_reply_quota INTEGER;
```

### Seller auto-reply (empty schema) — `[Phase F]`
Schema ships in Phase E.1.3 (already applied). Empty in Phase E. **Phase F ships as Pro Seller feature** per D-091.

### Listing quality rules — `[Phase E]` enforcement
- Required: at least 1 photo per listing (suggest 3+) — **`[Phase E]`** (no max cap in Phase E per Frank's confirmation 2025-05-19; Phase F+ may add per-tier caps)
- Required: price in kobo (Banked Principle 5 — prices must always be visible) — **`[Phase E]`**
- Required: city/area beyond state (text field) — **`[Phase E]`**
- Required: condition (for applicable categories — uses existing `category_specs`) — **`[Phase E]`**
- Required: title (5-100 chars) — **`[Phase E]`**
- Required: description (20-2000 chars) — **`[Phase E]`**
- Admin can hide listings with reason logged — **`[Phase E]`**

### Founding Seller badge infrastructure — `[Phase E]` schema, grants execute at Phase F launch

Per D-088. Schema additions to `businesses` table (Sprint 3 work):

```sql
ALTER TABLE businesses ADD COLUMN is_founding_seller BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE businesses ADD COLUMN founding_seller_granted_at TIMESTAMPTZ;
ALTER TABLE businesses ADD COLUMN grandfathered_pro_price_kobo INTEGER;
-- grandfathered_pro_price_kobo = 750000 (₦7,500) for Founding Sellers
-- when the Phase F launch grant executes; NULL otherwise.
```

The badge grant itself executes at Phase F launch via an admin-run script selecting the first 100 sellers ordered by `seller_verifications.reviewed_at ASC` where `seller_verifications.status = 'verified'`. Phase E **does not** execute the grants — only stages the infrastructure.

### Seller report/block tools — `[Phase E]`

Sellers can report buyers (spam, abusive messages, fraud attempts) and block buyers from messaging them. Uses the existing `reports` table (E.1.2) with `target_type='user'` and `blocks` table (E.1.2). Trust & safety operates equally regardless of tier per D-089 / Banked Principle 6.

### Mark-item-as-sold flow — `[Phase E]`

Seller marks a listing as sold via dashboard action. Listing transitions to `products.status = 'sold'` and is hidden from active marketplace search but remains on the seller's profile. Sold count is visible on the seller's storefront as foundation for Phase F+ transaction-history trust signal.

---

## 17. CATEGORIES & CATEGORY-AWARE FEATURES

### Category features JSONB
```sql
ALTER TABLE categories ADD COLUMN category_features JSONB DEFAULT '{}';
-- Examples:
-- {"warning_banner": "Always inspect properties in person", "high_value": true}
-- {"requires_condition_field": true}
-- {"requires_year_field": true} for vehicles
-- {"restricted": true, "min_seller_tier": "verified"} for sensitive categories
```

Phase E uses this for:
- Property warning banner (currently hardcoded — migrate to data)
- Category-specific listing field requirements
- Marking high-value categories (phones, laptops, vehicles, electronics, appliances)

Phase F+ uses for:
- Category-specific Pro pricing
- Category-restricted seller tiers
- Category-specific search rankings

### Restricted categories (empty schema)
```sql
CREATE TABLE restricted_categories (
  category_id UUID REFERENCES categories(id) PRIMARY KEY,
  restriction_type TEXT,
  -- 'requires_verification', 'requires_kyc', 'banned'
  min_seller_tier TEXT,
  notes TEXT
);
```
Empty in Phase E. Phase G+ uses for prescription items, firearms, etc.

---

## 18. FULFILLMENT INFRASTRUCTURE (EMPTY SCHEMAS, PHASE G+ READY)

```sql
CREATE TABLE delivery_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  type TEXT, -- 'logistics', 'rider_network', 'self_pickup'
  coverage_states UUID[], -- state_ids covered
  base_rate_kobo BIGINT,
  api_credentials JSONB,
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID REFERENCES profiles(id),
  seller_id UUID REFERENCES profiles(id),
  listing_id UUID REFERENCES products(id),
  conversation_id UUID REFERENCES conversations(id),
  status TEXT,
  -- 'pending', 'paid', 'shipped', 'delivered', 'completed', 'disputed', 'refunded'
  amount_kobo BIGINT,
  escrow_id UUID, -- references escrow_transactions
  shipping_address_id UUID REFERENCES shipping_addresses(id),
  delivery_partner_id UUID REFERENCES delivery_partners(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  from_status TEXT,
  to_status TEXT,
  changed_by UUID REFERENCES profiles(id),
  reason TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE shipping_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  delivery_partner_id UUID REFERENCES delivery_partners(id),
  quoted_amount_kobo BIGINT,
  estimated_delivery_days INTEGER,
  quoted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE escrow_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  buyer_id UUID REFERENCES profiles(id),
  seller_id UUID REFERENCES profiles(id),
  amount_kobo BIGINT,
  payment_provider TEXT, -- 'paystack' (D-074); other values added if Phase F+ alternatives ship
  provider_reference TEXT,
  status TEXT,
  -- 'held', 'released', 'refunded', 'disputed'
  held_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);

CREATE TABLE institution_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  industry TEXT,
  primary_contact_id UUID REFERENCES profiles(id),
  account_manager_id UUID REFERENCES admins(id),
  custom_terms JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

All empty in Phase E. Schemas exist so Phase G+ doesn't require migrations.

---

## 19. BUILD SEQUENCE FOR CODING AGENT

Recommended order to ship Phase E. Each section independently smoke-testable.

### Stage 1: Foundation (weeks 1-2)
1. K-011 fix (PKCE bug)
2. All schema migrations (every table in this spec, in dependency order)
3. `PaymentGateway` interface + `PaystackGateway` implementation
4. Filter rules seed data
5. Notification preferences seed data
6. Tier features seed data

### Stage 2: Buyer auth (weeks 3-4)
1. Termii OTP integration
2. Buyer signup flow (phone-primary)
3. Email confirmation (OTP-style, post-K-011)
4. Buyer profile page
5. **SMOKE TEST: full buyer signup flow**

### Stage 3: Messaging & PII filter (weeks 5-7)
1. Conversations table + RLS
2. Messages table + RLS
3. Supabase Realtime subscriptions
4. Typing indicators
5. Read receipts
6. Image attachments
7. PII filter (reads from filter_rules table)
8. Soft warning + Pro upgrade UX
9. Seller inbox grouped by listing
10. Quick reply templates
11. **SMOKE TEST: full buyer-seller conversation with image, filter trips, mark-as-sold**

### Stage 4: Saved listings (week 8)
1. Saved listings table + RLS
2. Bookmark button on listings
3. My Saved Listings page
4. Price history trigger
5. **SMOKE TEST: save/unsave, view saved, see greyed-out for sold**

### Stage 5: Notifications (weeks 9-10)
1. Notification log
2. In-app notification center
3. Email notifications via Resend (or chosen provider)
4. Email batching logic
5. Unsubscribe handling
6. **SMOKE TEST: full notification flow across in-app + email**

### Stage 6: Pro tier + Paystack (weeks 11-14)
1. Paystack Plans created in dashboard
2. Credit pack purchase flow
3. Subscription signup flow (card)
4. Direct Debit flow
5. Webhook handlers (5 events)
6. Launch promo migration logic
7. Subscription management UI
8. Card update deep-link
9. Cancellation flow with save offers
10. Pro feature unlocks (contact reveal, relaxed PII, SMS, Pro badge, priority inbox, revealed contacts page)
11. **SMOKE TEST: full purchase + subscription lifecycle + cancel + renewal + migration**

### Stage 7: Moderation (weeks 15-16)
1. Reports table + flows
2. Blocks table + enforcement
3. Admin moderation dashboard (extends Phase C.5 admin)
4. Admin action log
5. Admin email templates
6. Phone-only banner system
7. **SMOKE TEST: report flow, block flow, admin actions, email delivery**

### Stage 8: Seller features + analytics (weeks 17-18)
1. Seller profile enrichment fields
2. Reply rate calculation (nightly job)
3. Seller analytics materialized view
4. Listing quality rules enforcement
5. Search query logging
6. **SMOKE TEST: seller dashboard, reply rate accuracy, search logging**

### Stage 9: Staging + production rollout (weeks 19-20)
1. Full staging smoke test pass
2. Live mode Paystack keys
3. Production deploy
4. First 100 buyer trial
5. PII filter false-positive monitoring
6. Pricing review preparation (month 3 review)

**Realistic timeline: 18-22 weeks for full Phase E.**

---

## 20. POST-LAUNCH OPERATIONAL COMMITMENTS

### Month 1 after launch
- Daily PII filter false-positive review — tune rules in admin panel
- Daily report queue triage — establish baseline response time
- Watch Pro conversion rate vs targets (industry benchmark: 2-5%)

### Month 3 review checkpoint
- Pro pricing review — adjust if conversion below 2% or above 8%
- Launch promo ending — communicate price changes
- Refund volume review — evaluate automation need

### Month 6 review checkpoint
- Retention curve analysis (target: monthly 11-15% at 12 months, annual 28%+ at 12 months)
- Filter rule effectiveness review
- Seller tier introduction planning (Phase F+)

### Month 12 review checkpoint
- Standard pricing adjustment if warranted
- Premium tier readiness assessment (Phase G+ kickoff)
- International buyer demand assessment (Phase H+ planning)

### Launch marketing strategy
- Lagos + Abuja + Port Harcourt focused (despite national availability)
- First 100-500 buyers get one free contact reveal as launch incentive
- Pro seller verification incentive: free Pro buyer for 1 month for verified sellers who refer 5 buyers

---

## 21. FORWARD-PHASE COMMITMENTS

### Phase F+
- Voice notes in messages
- Stickers / GIFs
- Structured "Make an Offer" feature
- Browser push notifications
- Flutterwave secondary payment gateway (redundancy)
- Pro seller tier introduction (with auto-reply, listing limits, analytics)
- Saved searches as Pro buyer feature
- Price drop alerts
- In-app admin-to-user messaging
- Basic case management (clustering related reports)
- Multi-admin roles
- Google + Facebook OAuth signup

### Phase G+
- ~~Escrow infrastructure (₦50k+ threshold)~~ — **moved to Phase E** per D-082; escrow ships in Phase E as pay-per-use available to all buyers (Pro Buyers get discounted rate per D-086). The ₦50k+ threshold survives.
- ~~Monnify integration for escrow money flows~~ — **superseded** by D-074: Paystack is the primary payment processor for Phase E; Korapay is named documented fallback. Monnify is not on the current vendor list.
- ~~Premium buyer tier (Pro + escrow + buyer protection)~~ — **eliminated** per D-082. The Pro Buyer tier consolidates contact reveal + SMS + 1.2% escrow discount + priority dispute response (D-089). No separate Premium tier.
- Fulfillment partnerships (delivery partners) — still Phase G+
- Orders + order status tracking — still Phase G+ (schema scaffolded in E.1.3)
- Shipping quotes integration — still Phase G+
- Image OCR for PII filter (Phase E schema ready) — still Phase G+
- Appeals process for suspended users — still Phase G+
- Dispute resolution **automation** (escrow-specific) — Phase G+. Phase E ships manual admin dispute review.
- Restricted categories enforcement — still Phase G+ (schema scaffolded in E.1.3)

### Phase H+
- International buyer support
- Institution tier (multi-seat, custom terms, dedicated support)
- Multi-currency payments
- Sales-led B2B onboarding
- KYC verification flows

---

## 22. SCHEMA SUMMARY (ALL TABLES IN PHASE E)

### Tables modified
- `profiles` — added verification_status, auth_providers, display_name, full_name, state_id, phone, tier, tier_started_at, tier_expires_at
- `businesses` — added seller_tier, seller_listing_limit, seller_reply_quota
- `categories` — added category_features JSONB
- `products` — added price_history trigger

### New tables (populated in Phase E)
- `user_tier_history`
- `saved_listings`
- `price_history`
- `conversations`
- `messages`
- `notification_preferences`
- `notification_log`
- `filter_rules`
- `filter_actions_log`
- `payments`
- `subscriptions`
- `credit_balances`
- `tier_features`
- `contact_reveals`
- `reports`
- `blocks`
- `admins`
- `admin_action_log`
- `admin_emails`
- `search_query_log`

### New tables (empty in Phase E, ready for future phases)
- `shipping_addresses`
- `kyc_documents`
- `message_reactions`
- `message_image_analysis`
- `push_subscriptions`
- `escrow_transactions`
- `institution_accounts`
- `seller_auto_reply`
- `saved_searches`
- `restricted_categories`
- `delivery_partners`
- `orders`
- `order_status_history`
- `shipping_quotes`

---

## 23. ENVIRONMENT VARIABLES REQUIRED

Add to Cloudflare Pages environment:

```
# Termii
TERMII_API_KEY=
TERMII_SENDER_ID=ShowMePrice

# Paystack
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=
PAYSTACK_WEBHOOK_SECRET=
PAYSTACK_PLAN_MONTHLY_LAUNCH=
PAYSTACK_PLAN_MONTHLY_STANDARD=
PAYSTACK_PLAN_ANNUAL_LAUNCH=
PAYSTACK_PLAN_ANNUAL_STANDARD=

# Email (Resend or chosen provider)
RESEND_API_KEY=
EMAIL_FROM_NOREPLY=noreply@showmeprice.ng
EMAIL_FROM_SUPPORT=support@showmeprice.ng

# Supabase (existing)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## 24. DOCUMENT UPDATES REQUIRED IN REPO

After Phase E ships, update these canonical docs:

- **`ACTUAL_SCHEMA.md`** — append all new tables and columns
- **`DECISIONS.md`** — add entries D-054 through D-085 (one per major Phase E decision)
- **`MEMORY.md`** — Phase E completion notes
- **`KNOWN_ISSUES.md`** — close K-011, open any new issues discovered

---

## END OF PHASE E SPECIFICATION

**Total Phase E scope:** ~32 architectural additions, 20 populated tables, 14 empty-schema tables for future phases, 5 webhook handlers, 9 Pro features, 3-tier PII filter, full subscription lifecycle, moderation system, seller analytics foundation.

**Realistic timeline:** 18-22 weeks of focused engineering.

**Phase E ships ShowMePrice's trust positioning + monetization. Everything after is additive on this foundation.**
