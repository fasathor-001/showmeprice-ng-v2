-- ============================================================
-- E.2.9.0-message-images.sql
-- Stage 2.C Commit 9 — TC-001 / K-045 image sharing in messaging
-- ============================================================
-- Closes the "Can I see more pictures?" template-chip product
-- coherence gap shipped in Commit 7. Adds:
--   1) message_images   — per-message image metadata (≤3 per
--      message, position 0-2). FK to messages with CASCADE. RLS
--      gates SELECT to conversation participants and INSERT to
--      the message sender.
--   2) Storage bucket "message-images" — PRIVATE (not public),
--      5MB per-object limit, JPEG/PNG/WebP MIME whitelist.
--   3) Storage RLS policies on storage.objects gating both
--      SELECT and INSERT by conversation participant lookup.
--
-- Path structure (load-bearing for RLS):
--   message-images/{conversation_id}/{message_id}/{position}-{ts}.jpg
-- The conversation_id at folder[0] enables the RLS policy below
-- to look up participants via the conversations table.
--
-- EXECUTION: run §0 (read-only) + paste FIRST. Then §1 as ONE
-- BEGIN..COMMIT submission. Then §2 + paste.
-- ============================================================


-- ============================================================
-- SECTION 0 — PRE-FLIGHT (read-only; run + paste FIRST)
-- ============================================================

-- 0a. Confirm dependent tables exist with expected PKs.
SELECT table_name,
       (SELECT column_name FROM information_schema.key_column_usage k
        WHERE k.table_name = t.table_name
          AND k.table_schema = 'public'
          AND k.constraint_name LIKE '%_pkey'
        LIMIT 1) AS pk_column
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('messages', 'conversations', 'profiles')
ORDER BY table_name;
-- Expected: 3 rows, each with pk_column = 'id'.

-- 0b. Confirm message_images table does NOT already exist.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'message_images';
-- Expected on first run: 0 rows.

-- 0c. Confirm storage.objects table is accessible (Supabase Storage).
SELECT to_regclass('storage.objects') AS storage_objects;
-- Expected: 1 row with non-NULL OID.

-- 0d. Confirm the bucket does NOT already exist.
SELECT id, name, public
FROM storage.buckets
WHERE id = 'message-images';
-- Expected on first run: 0 rows.

-- 0e. Confirm messages.message_type enum includes 'image' (provisioned in
-- ACTUAL_SCHEMA but verify against live state).
SELECT enumlabel
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'message_type'
ORDER BY enumsortorder;
-- Expected: includes 'image' in the list.


-- ============================================================
-- SECTION 1 — MAIN MIGRATION (run as ONE BEGIN..COMMIT block)
-- ============================================================

BEGIN;

-- 1.A. message_images table.
-- Path: message-images/{conversation_id}/{message_id}/{position}-{ts}.jpg
-- (constructed in application code from message.conversation_id +
-- message_images.message_id + this row's position).
CREATE TABLE public.message_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    uuid NOT NULL
                REFERENCES public.messages(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  position      smallint NOT NULL CHECK (position BETWEEN 0 AND 2),
  width         integer NULL,
  height        integer NULL,
  byte_size     integer NULL,
  mime_type     text NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_images_message_position_unique
    UNIQUE (message_id, position)
);

-- Lookup index: load all images for a given message (small N ≤ 3 per row).
CREATE INDEX message_images_message_id_idx
  ON public.message_images (message_id);

-- Enable RLS — never trust deployment to default this on.
ALTER TABLE public.message_images ENABLE ROW LEVEL SECURITY;

-- SELECT policy: only conversation participants can read image metadata.
CREATE POLICY message_images_select_participants
ON public.message_images
FOR SELECT
USING (
  message_id IN (
    SELECT m.id FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE c.buyer_id = auth.uid() OR c.seller_id = auth.uid()
  )
);

-- INSERT policy: only the message sender can attach images to their own
-- message row. Defense-in-depth: server action already enforces this, but
-- RLS guarantees it even if the action layer is bypassed.
CREATE POLICY message_images_insert_sender
ON public.message_images
FOR INSERT
WITH CHECK (
  message_id IN (
    SELECT id FROM public.messages WHERE sender_id = auth.uid()
  )
);

-- No UPDATE or DELETE policies — images are immutable post-insert; deletion
-- happens via CASCADE on the messages row only.

-- 1.B. Storage bucket creation. Private (public=false), 5MB limit, MIME
-- whitelist. HEIC images are transcoded to JPEG client-side before upload
-- and never reach this bucket as HEIC.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-images',
  'message-images',
  false,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 1.C. Storage RLS policies on storage.objects.
-- SELECT: only conversation participants can read objects in this bucket.
-- The first path segment under message-images/ is the conversation_id;
-- storage.foldername() returns it as foldername[1] (1-indexed array).
CREATE POLICY message_images_storage_select
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'message-images'
  AND (
    auth.uid() IN (
      SELECT buyer_id FROM public.conversations
      WHERE id::text = (storage.foldername(name))[1]
    )
    OR auth.uid() IN (
      SELECT seller_id FROM public.conversations
      WHERE id::text = (storage.foldername(name))[1]
    )
  )
);

-- INSERT: only conversation participants can upload to a folder belonging
-- to their conversation. Application code additionally enforces that the
-- uploading user is the message sender (not just any participant) — but
-- at the Storage RLS layer, participant-level is sufficient (the application
-- mints signed-upload URLs that pin the folder to a single message row).
CREATE POLICY message_images_storage_insert
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'message-images'
  AND (
    auth.uid() IN (
      SELECT buyer_id FROM public.conversations
      WHERE id::text = (storage.foldername(name))[1]
    )
    OR auth.uid() IN (
      SELECT seller_id FROM public.conversations
      WHERE id::text = (storage.foldername(name))[1]
    )
  )
);

-- No UPDATE/DELETE policies on this bucket's objects either. Files are
-- immutable; orphan cleanup runs out-of-band per the K-010 pattern.

COMMIT;


-- ============================================================
-- SECTION 2 — VERIFICATION (run + paste AFTER §1)
-- ============================================================

-- 2a. message_images table exists with expected columns.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'message_images'
ORDER BY ordinal_position;
-- Expected: 9 rows — id, message_id, storage_path, position, width, height,
-- byte_size, mime_type, created_at.

-- 2b. CHECK + UNIQUE + FK constraints.
SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) AS def
FROM pg_constraint con
WHERE con.conrelid = 'public.message_images'::regclass
ORDER BY con.conname;
-- Expected: PRIMARY KEY (id), CHECK on position BETWEEN 0 AND 2, UNIQUE
-- (message_id, position), FK message_id → messages(id) ON DELETE CASCADE.

-- 2c. RLS enabled and policies present on message_images.
SELECT polname, polcmd
FROM pg_policy
WHERE polrelid = 'public.message_images'::regclass
ORDER BY polname;
-- Expected: message_images_select_participants (r), message_images_insert_sender (a).

SELECT relname, relrowsecurity
FROM pg_class
WHERE oid = 'public.message_images'::regclass;
-- Expected: relrowsecurity = true.

-- 2d. Index exists on message_id.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'message_images';
-- Expected: at least 2 indexes — pkey + message_images_message_id_idx.

-- 2e. Storage bucket configured correctly.
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'message-images';
-- Expected: 1 row, public=false, file_size_limit=5242880, allowed_mime_types
-- includes image/jpeg + image/png + image/webp.

-- 2f. Storage RLS policies on storage.objects scoped to this bucket.
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'message_images_%'
ORDER BY policyname;
-- Expected: 2 rows — message_images_storage_select (SELECT),
-- message_images_storage_insert (INSERT).
