-- ============================================================
-- E.2.8.0-notification-log-conversation-id.sql
-- Stage 2.C Commit 8 — TC-023 (offline-recipient new message email)
-- ============================================================
-- Adds `conversation_id uuid NULL REFERENCES conversations(id)` to
-- notification_log + a partial index supporting the 10-minute
-- per-(recipient, conversation) suppression-window query that drives the
-- hybrid debounce strategy for the new-message email channel.
--
-- BACKWARDS COMPATIBLE: column is NULLABLE. Existing rows (pre-Commit-8
-- in-app rows, future welcome/verification emails) leave conversation_id
-- NULL — that's the desired behavior. The suppression query in
-- send-message-notification.ts filters on `conversation_id = $cid`, so
-- NULL rows correctly never match the suppression window.
--
-- EXECUTION: run §0 (read-only) + paste FIRST. Then §1 as ONE
-- BEGIN..COMMIT submission (no text selected; "No limit" toggled). Then
-- §2 verification.
-- ============================================================


-- ============================================================
-- SECTION 0 — PRE-FLIGHT (read-only; run + paste FIRST)
-- ============================================================

-- 0a. Confirm notification_log + conversations exist with expected PKs.
SELECT table_name,
       (SELECT column_name FROM information_schema.key_column_usage k
        WHERE k.table_name = t.table_name
          AND k.table_schema = 'public'
          AND k.constraint_name LIKE '%_pkey'
        LIMIT 1) AS pk_column
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('notification_log', 'conversations')
ORDER BY table_name;
-- Expected: 2 rows, each with pk_column = 'id'.

-- 0b. Confirm conversation_id column does NOT already exist on notification_log.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'notification_log'
  AND column_name = 'conversation_id';
-- Expected on first run: 0 rows.

-- 0c. Confirm the partial index does NOT already exist.
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'notification_log'
  AND indexname = 'notification_log_recent_email_idx';
-- Expected on first run: 0 rows.

-- 0d. Confirm notification_event enum contains 'new_message'. If absent, the
-- §1.A ALTER TYPE handles it. Verify after §1 with §2c.
SELECT enumlabel
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'notification_event'
ORDER BY enumsortorder;
-- Expected: a list including (or about to include after §1) 'new_message'.


-- ============================================================
-- SECTION 1 — MAIN MIGRATION (run as ONE BEGIN..COMMIT block)
-- ============================================================

BEGIN;

-- 1.A. Ensure 'new_message' is a valid notification_event value.
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS is idempotent on Postgres 12+ (Supabase is 15).
ALTER TYPE notification_event ADD VALUE IF NOT EXISTS 'new_message';

-- 1.B. Add nullable conversation_id column with FK to conversations(id).
-- ON DELETE SET NULL — a conversation deletion shouldn't cascade-delete
-- historical notification rows; nulling the back-reference is the safe shape
-- (suppression query still works; row remains in audit trail).
ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS conversation_id uuid NULL
    REFERENCES public.conversations(id) ON DELETE SET NULL;

-- 1.C. Partial index supporting the suppression-window query:
--   SELECT 1 FROM notification_log
--   WHERE user_id = $1
--     AND event_type = 'new_message'
--     AND channel = 'email'
--     AND conversation_id = $2
--     AND sent_at > now() - interval '10 minutes'
--   LIMIT 1;
--
-- WHERE clause narrows to email-channel rows only (sms/in_app/push never hit
-- this query). user_id leads since it's the most selective. sent_at DESC
-- supports the LIMIT 1 scan ordering.
CREATE INDEX IF NOT EXISTS notification_log_recent_email_idx
  ON public.notification_log (user_id, event_type, conversation_id, sent_at DESC)
  WHERE channel = 'email';

COMMIT;


-- ============================================================
-- SECTION 2 — VERIFICATION (run + paste AFTER §1)
-- ============================================================

-- 2a. Column exists with correct type and nullability.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'notification_log'
  AND column_name = 'conversation_id';
-- Expected: 1 row — conversation_id | uuid | YES | (null).

-- 2b. FK constraint shape.
SELECT con.conname,
       con.confdeltype,  -- 'n' = SET NULL
       rel.relname AS referenced_table
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.confrelid
WHERE con.conrelid = 'public.notification_log'::regclass
  AND con.contype = 'f'
  AND con.conname LIKE '%conversation_id%';
-- Expected: 1 row — confdeltype = 'n' (SET NULL), referenced_table = 'conversations'.

-- 2c. 'new_message' present in enum.
SELECT enumlabel
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'notification_event'
  AND enumlabel = 'new_message';
-- Expected: 1 row.

-- 2d. Partial index exists with the right predicate.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'notification_log'
  AND indexname = 'notification_log_recent_email_idx';
-- Expected: 1 row — indexdef includes "WHERE (channel = 'email')".

-- 2e. Existing rows have NULL conversation_id (no backfill expected).
SELECT COUNT(*) AS total_rows,
       COUNT(*) FILTER (WHERE conversation_id IS NULL) AS null_conversation_id
FROM public.notification_log;
-- Expected: total_rows = null_conversation_id (all existing rows are NULL — they're
-- in-app rows from existing flows that don't carry a conversation reference).
