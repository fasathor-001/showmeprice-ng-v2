-- ============================================================
-- E.2.3.0-filter-rules-reconciliation.sql
-- Stage 2.B Phase 2 / Commit B — D-110 Interpretation C
-- ============================================================
-- Reconciles filter_rules for the MESSAGE context to D-110 Interpretation C
-- (D-097/D-101: messaging MVP = warnings, not hard blocks):
--   * email + nuban: were BLOCK in both message + listing_description.
--       -> keep BLOCK for listing_description; add WARN for message,
--          tier={free} (Pro-exempt — §10 Pro-relaxation; mirrors phone +
--          social_handle message-warn rules).
--   * whatsapp/signal/telegram/payment_url/shortened_url message blocks already
--     correct (hard block) — untouched. Listings unchanged.
--
-- COLUMN TYPES: applies_to_context + applies_to_tier are text[] (NOT jsonb).
-- Confirmed via §0 on 2026-05-22. Supabase CSV renders a text[]-of-strings in a
-- JSON-like form; only information_schema.data_type/udt_name is authoritative.
--
-- EXECUTION: run §0 (read-only) + paste FIRST. Then §1 as ONE BEGIN..COMMIT
-- submission (no text selected; "No limit" toggled). Then §2 + paste.
-- STATUS: applied + verified in production 2026-05-22 (§2 returned the 4
-- expected rows; §1 DO-block assertions passed — no ERROR raised).
-- ============================================================


-- ============================================================
-- SECTION 0 — PRE-FLIGHT (read-only; run + paste FIRST)
-- ============================================================
-- 0a. Column types. CONFIRMED 2026-05-22: data_type='ARRAY', udt_name='_text' (text[]).
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='filter_rules'
  AND column_name IN ('applies_to_context','applies_to_tier')
ORDER BY column_name;
-- Expected: both rows -> ARRAY / _text.

-- 0b. Pre-state of the rules being split.
SELECT id, rule_type, action, applies_to_context, applies_to_tier, active
FROM filter_rules
WHERE rule_type IN ('email','nuban')
ORDER BY rule_type, action;
-- Expected pre-migration: 2 rows, each block / {message,listing_description} / {free,pro}.


-- ============================================================
-- SECTION 1 — MIGRATION (one BEGIN..COMMIT submission)
-- ============================================================
BEGIN;

-- 1. email block rule -> listing_description only (strip 'message').
UPDATE filter_rules
SET applies_to_context = ARRAY['listing_description']::text[],
    updated_at = now()
WHERE id = '7b469d42-d7f3-45cf-974a-4662a8c100d2'
  AND rule_type = 'email' AND action = 'block';

-- 2. email warn rule for message (tier={free}). Guarded for clean re-run.
INSERT INTO filter_rules (rule_type, pattern, action, applies_to_context, applies_to_tier, active)
SELECT 'email', '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'warn',
       ARRAY['message']::text[], ARRAY['free']::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM filter_rules
  WHERE rule_type='email' AND action='warn' AND 'message' = ANY(applies_to_context)
);

-- 3. nuban block rule -> listing_description only (strip 'message').
UPDATE filter_rules
SET applies_to_context = ARRAY['listing_description']::text[],
    updated_at = now()
WHERE id = '62bb30f5-5f76-4e1c-8e15-da11ee20ff7c'
  AND rule_type = 'nuban' AND action = 'block';

-- 4. nuban warn rule for message (tier={free}). Guarded for clean re-run.
INSERT INTO filter_rules (rule_type, pattern, action, applies_to_context, applies_to_tier, active)
SELECT 'nuban', '\b\d{10}\b', 'warn',
       ARRAY['message']::text[], ARRAY['free']::text[], true
WHERE NOT EXISTS (
  SELECT 1 FROM filter_rules
  WHERE rule_type='nuban' AND action='warn' AND 'message' = ANY(applies_to_context)
);

-- §1 inline verification — any failed assertion ROLLBACKs the whole txn.
DO $$
DECLARE
  email_block_listing INT; email_warn_message INT;
  nuban_block_listing INT; nuban_warn_message INT;
  block_still_message INT;
  email_warn_tier text[]; nuban_warn_tier text[];
BEGIN
  SELECT count(*) INTO email_block_listing FROM filter_rules
   WHERE rule_type='email' AND action='block' AND 'listing_description' = ANY(applies_to_context);
  SELECT count(*) INTO email_warn_message FROM filter_rules
   WHERE rule_type='email' AND action='warn'  AND 'message' = ANY(applies_to_context);
  SELECT count(*) INTO nuban_block_listing FROM filter_rules
   WHERE rule_type='nuban' AND action='block' AND 'listing_description' = ANY(applies_to_context);
  SELECT count(*) INTO nuban_warn_message FROM filter_rules
   WHERE rule_type='nuban' AND action='warn'  AND 'message' = ANY(applies_to_context);
  SELECT count(*) INTO block_still_message FROM filter_rules
   WHERE rule_type IN ('email','nuban') AND action='block' AND 'message' = ANY(applies_to_context);
  SELECT applies_to_tier INTO email_warn_tier FROM filter_rules
   WHERE rule_type='email' AND action='warn' AND 'message' = ANY(applies_to_context) LIMIT 1;
  SELECT applies_to_tier INTO nuban_warn_tier FROM filter_rules
   WHERE rule_type='nuban' AND action='warn' AND 'message' = ANY(applies_to_context) LIMIT 1;

  IF email_block_listing <> 1 THEN RAISE EXCEPTION 'email block-listing = % (expected 1)', email_block_listing; END IF;
  IF email_warn_message  <> 1 THEN RAISE EXCEPTION 'email warn-message = % (expected 1)', email_warn_message; END IF;
  IF nuban_block_listing <> 1 THEN RAISE EXCEPTION 'nuban block-listing = % (expected 1)', nuban_block_listing; END IF;
  IF nuban_warn_message  <> 1 THEN RAISE EXCEPTION 'nuban warn-message = % (expected 1)', nuban_warn_message; END IF;
  IF block_still_message <> 0 THEN RAISE EXCEPTION 'email/nuban block still targets message = % (expected 0)', block_still_message; END IF;
  IF email_warn_tier <> ARRAY['free']::text[] THEN RAISE EXCEPTION 'email warn tier = % (expected {free})', email_warn_tier; END IF;
  IF nuban_warn_tier <> ARRAY['free']::text[] THEN RAISE EXCEPTION 'nuban warn tier = % (expected {free})', nuban_warn_tier; END IF;

  RAISE NOTICE 'E.2.3.0 verification passed: email + nuban split to block(listing) / warn(message, free).';
END $$;

COMMIT;


-- ============================================================
-- SECTION 2 — PASTE-BACK VERIFICATION (read-only; run AFTER COMMIT)
-- ============================================================
SELECT rule_type, action, applies_to_context, applies_to_tier
FROM filter_rules
WHERE rule_type IN ('email','nuban')
ORDER BY rule_type, action;
-- Expected 4 rows (Supabase may render text[] JSON-style):
--   email | block | {listing_description} | {free,pro}
--   email | warn  | {message}             | {free}
--   nuban | block | {listing_description} | {free,pro}
--   nuban | warn  | {message}             | {free}

-- ============================================================
-- END OF E.2.3.0
-- ============================================================
