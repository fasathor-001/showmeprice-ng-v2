-- ============================================================
-- E.2.6.0-filter-rules-expansion.sql
-- Stage 2.B Commit 1.6 — D-119 (D-110 filter system expansion)
-- ============================================================
-- Adds Nigerian-specific filter patterns surfaced by adversarial smoke testing
-- of Stage 2.B Commit 1. Track 1 of Commit 1.6 (D-119); Track 2 (D-120 payment
-- details) ships separately as E.2.7.0.
--
-- Scope: MESSAGE context only. Listing-context enforcement deferred to K-036
-- (current listing CREATE/EDIT actions do not invoke `runMessageFilter`).
--
-- COLUMN TYPES: applies_to_context + applies_to_tier are text[]. Confirmed in
-- E.2.3.0 §0 (2026-05-22). DO NOT use jsonb literals here.
--
-- TIER POLICY (precedent from E.2.3.0):
--   * BLOCK rules apply to {free, pro} — both tiers.
--   * WARN rules apply to {free} — Pro relaxation (§10 D-110 thinking).
--
-- REVISION 2 (after §0 paste-back, 2026-05-23):
--   * ADD §1.0 UPDATE: nuban message-context warn→block (D-119 explicit policy).
--     K-029 whitelist guard in filters.ts updated in same commit to apply to
--     block-tier so legitimate ₦1B+ prices don't get hard-blocked.
--   * DROP #6 signal_link extra: production already has
--     (signal\.me|signal\.org) covering both contexts. The migration's
--     /-anchored variant is a strict subset — pure redundancy.
--   * REDUCE #5a telegram_link extra to just `telegram\.org/?` — production
--     already covers t.me and telegram.me.
--   * DROP apostrophe variant in #7b off_platform_handoff. The doubled-quote
--     SQL escape breaks Supabase SQL Editor's multi-statement parser. Use
--     `lets` and `let us` instead (common in informal Nigerian English).
--   * RULE_TYPES touched: phone_ng (new), whatsapp_link (extended),
--     payment_url (extended), shortened_url (extended), telegram_link
--     (extended), telegram_ref (new), off_platform_handoff (new),
--     bank_platform_ref (new). 9 new rows + 1 UPDATE.
--
-- EXECUTION: §0 was already paste-backed; ONLY §1 + §2 remain to run.
-- ============================================================


-- ============================================================
-- SECTION 0 — PRE-FLIGHT (read-only — already executed 2026-05-23)
-- ============================================================
-- Kept for the journal; running again is safe but unnecessary.

SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='filter_rules'
  AND column_name IN ('applies_to_context','applies_to_tier')
ORDER BY column_name;
-- Confirmed: both ARRAY / _text.

SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.filter_rules'::regclass
  AND contype = 'c';
-- Confirmed: action CHECK allows block/warn/allow.

SELECT rule_type, action, count(*) AS n
FROM filter_rules
GROUP BY rule_type, action
ORDER BY rule_type, action;
-- Baseline at §0 time: 15 active rules.

-- Pre-flight also confirmed: signal_link production pattern
-- (signal\.me|signal\.org) already covers both contexts; telegram_link
-- production pattern (t\.me|telegram\.me) already covers t.me + telegram.me;
-- nuban is currently warn in message context (must flip to block per D-119).


-- ============================================================
-- SECTION 1 — MIGRATION (one BEGIN..COMMIT submission)
-- ============================================================
BEGIN;

-- ---------- §1.0 NUBAN policy alignment (D-119: BLOCK in chat) -------------
-- Production has `nuban | warn | message | {free}` (E.2.3.0 Interp. C). D-119
-- explicitly upgrades to BLOCK: "NUBAN bank accounts (10 digits): BLOCK in
-- chat. Sellers share payment details via D-120 controlled flow, not free-text
-- chat." Application-level K-029 price-context whitelist extended in the same
-- commit to apply to block-tier (see src/lib/messaging/filters.ts).
--
-- Tier scope: keep {free} (Pro relaxation precedent from E.2.3.0). Pro buyers
-- are exempt from nuban filtering in messages; warn precedent retained as
-- block tier-scope. (If D-119 intent was both tiers, separate decision to
-- escalate — not banked.)
UPDATE filter_rules
SET action = 'block',
    description = COALESCE(description, '') ||
                  ' [D-119 2026-05-23: warn→block, K-029 whitelist now applies to block-tier in app code]',
    updated_at = now()
WHERE rule_type = 'nuban'
  AND action = 'warn'
  AND 'message' = ANY(applies_to_context);

-- ---------- §1.1 BLOCK rules (tier: free + pro) ----------------------------

-- 1. phone_ng — Nigerian-format phone number (separator-tolerant). Distinct
-- from the existing generic `phone` rule (concat-only pattern). Block
-- precedence in matchFilterRules means this fires first; existing
-- `phone | warn | message | {free}` rule remains as defense-in-depth.
INSERT INTO filter_rules (rule_type, pattern, action, applies_to_context, applies_to_tier, description, active)
SELECT 'phone_ng',
       '(?:(?:\+?234|0)[\-\.\s]?(?:70|80|81|90|91)[\-\.\s]?\d[\-\.\s]?\d{3}[\-\.\s]?\d{4})',
       'block',
       ARRAY['message']::text[], ARRAY['free','pro']::text[],
       'D-119: Nigerian phone numbers in any format (separator-tolerant). Buyers use contact-reveal (D-113) for seller phone access.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM filter_rules
  WHERE rule_type='phone_ng' AND action='block'
    AND 'message' = ANY(applies_to_context)
);

-- 2. whatsapp_link typo variants (extend existing whatsapp_link rule with a
-- second row covering typo domains).
INSERT INTO filter_rules (rule_type, pattern, action, applies_to_context, applies_to_tier, description, active)
SELECT 'whatsapp_link',
       '(?:we\.me|w-a\.me|whatsap\.me|whatsap\.com)',
       'block',
       ARRAY['message']::text[], ARRAY['free','pro']::text[],
       'D-119: WhatsApp domain typo variants (we.me, w-a.me, whatsap.me, whatsap.com).',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM filter_rules
  WHERE rule_type='whatsapp_link' AND action='block'
    AND pattern = '(?:we\.me|w-a\.me|whatsap\.me|whatsap\.com)'
);

-- 3. payment_url additional platforms (extends existing payment_url rule).
INSERT INTO filter_rules (rule_type, pattern, action, applies_to_context, applies_to_tier, description, active)
SELECT 'payment_url',
       '(?:paystack\.com/pay|flutterwave\.com|flw\.co|monnify\.com|opay\.com\.ng|app\.opay|paypal\.me)',
       'block',
       ARRAY['message']::text[], ARRAY['free','pro']::text[],
       'D-119: Payment platform links (Paystack, Flutterwave, Monnify, Opay, PayPal). ShowMePrice does not process product payments at MVP (D-111).',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM filter_rules
  WHERE rule_type='payment_url' AND action='block'
    AND pattern = '(?:paystack\.com/pay|flutterwave\.com|flw\.co|monnify\.com|opay\.com\.ng|app\.opay|paypal\.me)'
);

-- 4. shortened_url additional shorteners (extends existing shortened_url rule).
INSERT INTO filter_rules (rule_type, pattern, action, applies_to_context, applies_to_tier, description, active)
SELECT 'shortened_url',
       '(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly|rebrand\.ly|shorturl\.at|is\.gd|ow\.ly)/\w+',
       'block',
       ARRAY['message']::text[], ARRAY['free','pro']::text[],
       'D-119: Shortened URLs (anti-phishing). Buyers should see the destination domain before clicking.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM filter_rules
  WHERE rule_type='shortened_url' AND action='block'
    AND pattern = '(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly|rebrand\.ly|shorturl\.at|is\.gd|ow\.ly)/\w+'
);

-- 5a. telegram_link extended — telegram.org only (production already covers
-- t.me and telegram.me). REVISED: pattern reduced to just the net new
-- coverage.
INSERT INTO filter_rules (rule_type, pattern, action, applies_to_context, applies_to_tier, description, active)
SELECT 'telegram_link',
       'telegram\.org/?',
       'block',
       ARRAY['message']::text[], ARRAY['free','pro']::text[],
       'D-119: Telegram URL coverage gap — telegram.org. Production already covers t.me + telegram.me.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM filter_rules
  WHERE rule_type='telegram_link' AND action='block'
    AND pattern = 'telegram\.org/?'
);

-- 5b. telegram_ref — textual references like "my telegram is X" (BLOCK per
-- D-119: too risky for MVP to warn).
INSERT INTO filter_rules (rule_type, pattern, action, applies_to_context, applies_to_tier, description, active)
SELECT 'telegram_ref',
       '\b(?:telegram|tele(?:gram)?\s+(?:id|handle|username|account|name|me|number))\b',
       'block',
       ARRAY['message']::text[], ARRAY['free','pro']::text[],
       'D-119: Textual Telegram references without explicit URL. Block (not warn) per D-119 — keep conversation on ShowMePrice for traceability.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM filter_rules
  WHERE rule_type='telegram_ref' AND action='block'
    AND 'message' = ANY(applies_to_context)
);

-- 6. signal_link extended — DROPPED. Production already has
-- (signal\.me|signal\.org) covering both message + listing_description.
-- The migration's /-anchored variant was a strict subset (pure redundancy).

-- ---------- §1.2 WARN rules (tier: free; Pro relaxation per E.2.3.0) -------

-- 7a. off_platform_handoff — "contact me on whatsapp" style language.
INSERT INTO filter_rules (rule_type, pattern, action, applies_to_context, applies_to_tier, description, active)
SELECT 'off_platform_handoff',
       '\b(?:meet|come|see|find|contact|reach|call|text|dm|message)\s+(?:me|us)\s+(?:on|at|in|via|outside)\s+(?:whatsapp|telegram|signal|insta(?:gram)?|ig|fb|facebook|tiktok|snapchat)\b',
       'warn',
       ARRAY['message']::text[], ARRAY['free']::text[],
       'D-119: Off-platform handoff language ("contact me on whatsapp"). Warn at every send — moving off-platform reduces protection.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM filter_rules
  WHERE rule_type='off_platform_handoff' AND action='warn'
    AND pattern = '\b(?:meet|come|see|find|contact|reach|call|text|dm|message)\s+(?:me|us)\s+(?:on|at|in|via|outside)\s+(?:whatsapp|telegram|signal|insta(?:gram)?|ig|fb|facebook|tiktok|snapchat)\b'
);

-- 7b. off_platform_handoff variant — "lets talk privately/outside/elsewhere".
-- REVISED: apostrophe form ("let's") dropped — doubled-quote SQL escape
-- breaks Supabase SQL Editor multi-statement parser. "lets" + "let us"
-- alternatives cover the common informal Nigerian English variants.
INSERT INTO filter_rules (rule_type, pattern, action, applies_to_context, applies_to_tier, description, active)
SELECT 'off_platform_handoff',
       '\b(?:continue|chat|talk|lets\s+talk|let\s+us\s+talk)\s+(?:on|outside|privately|elsewhere)\b',
       'warn',
       ARRAY['message']::text[], ARRAY['free']::text[],
       'D-119: Off-platform handoff variants (lets/let us talk privately/outside/elsewhere). Apostrophe form (let''s) excluded for SQL editor compat.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM filter_rules
  WHERE rule_type='off_platform_handoff' AND action='warn'
    AND pattern = '\b(?:continue|chat|talk|lets\s+talk|let\s+us\s+talk)\s+(?:on|outside|privately|elsewhere)\b'
);

-- 8. bank_platform_ref — Nigerian bank/fintech platform names (warn).
INSERT INTO filter_rules (rule_type, pattern, action, applies_to_context, applies_to_tier, description, active)
SELECT 'bank_platform_ref',
       '\b(?:gtbank|gtb|first\s*bank|fbn|access\s*bank|zenith|uba|moniepoint|opay|palmpay|kuda|carbon)\b',
       'warn',
       ARRAY['message']::text[], ARRAY['free']::text[],
       'D-119: Bank platform name references. Warn — typically benign in chat but used in social-engineering setups.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM filter_rules
  WHERE rule_type='bank_platform_ref' AND action='warn'
    AND 'message' = ANY(applies_to_context)
);

-- ---------- §1.3 inline verification — assertions ROLLBACK on failure ------

DO $$
DECLARE
  nuban_message_block        INT;
  nuban_message_warn         INT;
  phone_ng_block             INT;
  whatsapp_typo_block        INT;
  payment_url_extra_block    INT;
  shortened_url_extra_block  INT;
  telegram_link_org_block    INT;
  telegram_ref_block         INT;
  off_platform_warn          INT;
  bank_platform_warn         INT;
  phone_ng_tier              text[];
  off_platform_tier          text[];
  nuban_block_tier           text[];
BEGIN
  -- §1.0 nuban warn→block flip
  SELECT count(*) INTO nuban_message_block FROM filter_rules
    WHERE rule_type='nuban' AND action='block' AND 'message' = ANY(applies_to_context);
  SELECT count(*) INTO nuban_message_warn FROM filter_rules
    WHERE rule_type='nuban' AND action='warn' AND 'message' = ANY(applies_to_context);

  IF nuban_message_block <> 1 THEN
    RAISE EXCEPTION 'nuban message-context block count = % (expected 1 after warn→block flip)', nuban_message_block;
  END IF;
  IF nuban_message_warn <> 0 THEN
    RAISE EXCEPTION 'nuban message-context warn count = % (expected 0 — warn row should have flipped to block)', nuban_message_warn;
  END IF;

  -- §1.1 BLOCK rule inserts
  SELECT count(*) INTO phone_ng_block FROM filter_rules
    WHERE rule_type='phone_ng' AND action='block' AND 'message' = ANY(applies_to_context);
  SELECT count(*) INTO whatsapp_typo_block FROM filter_rules
    WHERE rule_type='whatsapp_link' AND pattern = '(?:we\.me|w-a\.me|whatsap\.me|whatsap\.com)';
  SELECT count(*) INTO payment_url_extra_block FROM filter_rules
    WHERE rule_type='payment_url'
      AND pattern = '(?:paystack\.com/pay|flutterwave\.com|flw\.co|monnify\.com|opay\.com\.ng|app\.opay|paypal\.me)';
  SELECT count(*) INTO shortened_url_extra_block FROM filter_rules
    WHERE rule_type='shortened_url'
      AND pattern = '(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly|rebrand\.ly|shorturl\.at|is\.gd|ow\.ly)/\w+';
  SELECT count(*) INTO telegram_link_org_block FROM filter_rules
    WHERE rule_type='telegram_link' AND pattern = 'telegram\.org/?';
  SELECT count(*) INTO telegram_ref_block FROM filter_rules
    WHERE rule_type='telegram_ref' AND action='block' AND 'message' = ANY(applies_to_context);

  -- §1.2 WARN rule inserts
  SELECT count(*) INTO off_platform_warn FROM filter_rules
    WHERE rule_type='off_platform_handoff' AND action='warn' AND 'message' = ANY(applies_to_context);
  SELECT count(*) INTO bank_platform_warn FROM filter_rules
    WHERE rule_type='bank_platform_ref' AND action='warn' AND 'message' = ANY(applies_to_context);

  -- Tier scopes
  SELECT applies_to_tier INTO phone_ng_tier FROM filter_rules
    WHERE rule_type='phone_ng' AND action='block' AND 'message' = ANY(applies_to_context) LIMIT 1;
  SELECT applies_to_tier INTO off_platform_tier FROM filter_rules
    WHERE rule_type='off_platform_handoff' AND action='warn' AND 'message' = ANY(applies_to_context) LIMIT 1;
  SELECT applies_to_tier INTO nuban_block_tier FROM filter_rules
    WHERE rule_type='nuban' AND action='block' AND 'message' = ANY(applies_to_context) LIMIT 1;

  IF phone_ng_block <> 1 THEN RAISE EXCEPTION 'phone_ng block row count = % (expected 1)', phone_ng_block; END IF;
  IF whatsapp_typo_block <> 1 THEN RAISE EXCEPTION 'whatsapp_link typo row count = % (expected 1)', whatsapp_typo_block; END IF;
  IF payment_url_extra_block <> 1 THEN RAISE EXCEPTION 'payment_url extra row count = % (expected 1)', payment_url_extra_block; END IF;
  IF shortened_url_extra_block <> 1 THEN RAISE EXCEPTION 'shortened_url extra row count = % (expected 1)', shortened_url_extra_block; END IF;
  IF telegram_link_org_block <> 1 THEN RAISE EXCEPTION 'telegram_link telegram.org row count = % (expected 1)', telegram_link_org_block; END IF;
  IF telegram_ref_block <> 1 THEN RAISE EXCEPTION 'telegram_ref block row count = % (expected 1)', telegram_ref_block; END IF;
  IF off_platform_warn < 2 THEN RAISE EXCEPTION 'off_platform_handoff warn row count = % (expected >=2 — handoff + lets-talk variants)', off_platform_warn; END IF;
  IF bank_platform_warn <> 1 THEN RAISE EXCEPTION 'bank_platform_ref warn row count = % (expected 1)', bank_platform_warn; END IF;

  IF phone_ng_tier <> ARRAY['free','pro']::text[] THEN
    RAISE EXCEPTION 'phone_ng tier = % (expected {free,pro})', phone_ng_tier;
  END IF;
  IF off_platform_tier <> ARRAY['free']::text[] THEN
    RAISE EXCEPTION 'off_platform_handoff tier = % (expected {free})', off_platform_tier;
  END IF;
  IF nuban_block_tier <> ARRAY['free']::text[] THEN
    RAISE EXCEPTION 'nuban block tier = % (expected {free} — Pro relaxation preserved)', nuban_block_tier;
  END IF;

  RAISE NOTICE 'E.2.6.0 verification passed: nuban warn→block + 9 new D-119 rules (phone_ng, whatsapp_typo, payment_url+, shortened_url+, telegram.org, telegram_ref, off_platform_handoff x2, bank_platform_ref). signal_link extra DROPPED (already covered). telegram_link reduced to telegram.org-only.';
END $$;

COMMIT;


-- ============================================================
-- SECTION 2 — PASTE-BACK VERIFICATION (read-only; run AFTER COMMIT)
-- ============================================================

-- 2a. nuban policy alignment — confirm flip succeeded
SELECT rule_type, action, applies_to_context, applies_to_tier
FROM filter_rules
WHERE rule_type = 'nuban'
ORDER BY action, applies_to_context;
-- Expected 2 rows:
--   nuban | block | {listing_description} | {free,pro}  (pre-existing, untouched)
--   nuban | block | {message}             | {free}      (was warn, now block)

-- 2b. All D-119 new + extended rules
SELECT rule_type, action, pattern, applies_to_context, applies_to_tier, active
FROM filter_rules
WHERE rule_type IN (
  'phone_ng', 'whatsapp_link', 'payment_url', 'shortened_url',
  'telegram_link', 'telegram_ref',
  'off_platform_handoff', 'bank_platform_ref'
)
  AND 'message' = ANY(applies_to_context)
ORDER BY rule_type, action, pattern;
-- Expected new rows (in addition to pre-existing whatsapp_link/payment_url/etc.):
--   phone_ng              | block | (Nigerian sep-tolerant pattern)
--   whatsapp_link         | block | (?:we\.me|w-a\.me|whatsap\.me|whatsap\.com)
--   payment_url           | block | (paystack/flutterwave/monnify/opay/paypal pattern)
--   shortened_url         | block | (bit.ly/tinyurl/etc. pattern)
--   telegram_link         | block | telegram\.org/?
--   telegram_ref          | block | (textual telegram reference)
--   off_platform_handoff  | warn  | (handoff-language pattern)
--   off_platform_handoff  | warn  | (lets-talk-privately pattern)
--   bank_platform_ref     | warn  | (bank brand names)
-- Pre-existing rows for whatsapp_link/payment_url/shortened_url/telegram_link
-- remain alongside.

-- 2c. Total active filter_rules row count
SELECT count(*) AS total_active_rules FROM filter_rules WHERE active = true;
-- Expected: 15 (baseline) + 9 (new rows; signal_link extra was dropped) = 24.
-- Note: nuban warn→block flip is an UPDATE so doesn't change the count.

-- ============================================================
-- END OF E.2.6.0
-- ============================================================
