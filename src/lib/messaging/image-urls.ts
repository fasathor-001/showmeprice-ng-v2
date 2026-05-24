"use server";

// Stage 2.C Commit 9 — TC-001 image-message signed URL minting.
//
// The message-images bucket is PRIVATE (E.2.9.0). Reads happen via
// time-bounded signed URLs (5-min TTL). RLS on storage.objects gates
// minting to conversation participants only — service-role bypasses RLS so
// this action uses the authenticated client (defense in depth).
//
// Two surfaces:
//  · mintMessageImageUrls(messageImageIds)  — batch helper; returns a
//    record keyed by message_image.id → signed URL string. Used by the
//    bubble's React state cache (see §13.B surface findings).
//  · mintMessageImageUploadUrls(conversationId, tempMessageId, count)
//    — pre-INSERT helper; mints signed-upload URLs that the client uses
//    via XHR PUT for real-time per-image upload progress events. Returns
//    the stable storage paths so the client can pass them back to
//    sendImageMessage on completion.

import { createClient } from "@/lib/supabase/server";

const BUCKET = "message-images";
const SIGNED_URL_TTL_SECONDS = 5 * 60; // 5 minutes per audit §13.A
// Note: Supabase's createSignedUploadUrl() doesn't take a TTL parameter
// (uses a fixed default short-lived window). If/when the SDK exposes it,
// pin to 5 minutes to match the read-URL TTL.

interface MintResult {
  urls?: Record<string, string>; // image_id → signed URL
  error?: "Unauthorized" | "NotFound" | "Unknown";
}

/**
 * Batch-mint signed download URLs for a set of message_images.id values.
 * Returns a map; missing entries indicate per-image failure (caller falls
 * back to placeholder + tap-to-retry per §13.C).
 */
export async function mintMessageImageUrls(
  messageImageIds: string[],
): Promise<MintResult> {
  if (messageImageIds.length === 0) return { urls: {} };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // RLS on message_images filters to rows the user can see (conversation
  // participants). The auth client respects this; rows we can't see come
  // back empty.
  const { data, error } = await supabase
    .from("message_images")
    .select("id, storage_path")
    .in("id", messageImageIds);
  if (error) {
    console.error("[mintMessageImageUrls] query failed", error.message);
    return { error: "Unknown" };
  }
  if (!data || data.length === 0) return { urls: {} };

  const urls: Record<string, string> = {};
  // Sign in parallel — small N (≤3 per message, usually 1 message at a time).
  await Promise.all(
    data.map(async (row) => {
      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(row.storage_path as string, SIGNED_URL_TTL_SECONDS);
      if (signErr || !signed?.signedUrl) {
        console.error(
          "[mintMessageImageUrls] sign failed",
          row.id,
          signErr?.message,
        );
        return; // omit from map → placeholder + retry on caller
      }
      urls[row.id as string] = signed.signedUrl;
    }),
  );

  return { urls };
}

interface UploadSlot {
  position: number;
  storagePath: string;
  signedUploadUrl: string;
  token: string;
}

interface MintUploadResult {
  slots?: UploadSlot[];
  error?:
    | "Unauthorized"
    | "PhoneVerificationRequired"
    | "Forbidden"
    | "NotFound"
    | "Unknown";
}

/**
 * Mint signed-upload URLs for the client to PUT compressed JPEGs directly
 * to Storage. Lets the client use XHR's onUploadProgress for per-image
 * progress bars (Supabase JS .upload() doesn't surface progress).
 *
 * Path: message-images/{conversation_id}/{tempMessageId}/{position}-{ts}.jpg
 * — the tempMessageId is a UUID generated client-side that we'll persist
 * as the messages.id when sendImageMessage runs (transparent reuse).
 */
export async function mintMessageImageUploadUrls(
  conversationId: string,
  tempMessageId: string,
  positions: number[],
): Promise<MintUploadResult> {
  if (positions.length === 0) return { slots: [] };
  if (positions.length > 3) return { error: "Forbidden" }; // anti-misuse

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Verify user is a participant in this conversation (defense in depth
  // alongside RLS; gives a clean error rather than a Storage-layer 403).
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return { error: "NotFound" };
  if (conv.buyer_id !== user.id && conv.seller_id !== user.id) {
    return { error: "Forbidden" };
  }

  const ts = Date.now();
  const slots: UploadSlot[] = [];
  for (const position of positions) {
    if (position < 0 || position > 2) return { error: "Forbidden" };
    const storagePath = `${conversationId}/${tempMessageId}/${position}-${ts}.jpg`;
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);
    if (signErr || !signed) {
      console.error(
        "[mintMessageImageUploadUrls] sign failed",
        position,
        signErr?.message,
      );
      return { error: "Unknown" };
    }
    slots.push({
      position,
      storagePath,
      signedUploadUrl: signed.signedUrl,
      token: signed.token,
    });
  }

  return { slots };
}
