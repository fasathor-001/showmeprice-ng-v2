"use server";

// Stage 2.B messaging — server actions (Commit 1).
//
// Clients: the authenticated createClient() is used for conversations/messages/
// profiles so the deployed RLS (party-scoping) is defense-in-depth alongside the
// explicit checks here. The D-110 filter reads filter_rules via the service-role
// admin client (see filters.ts — reference data, fail-closed). last_seen_at (D-109)
// is written on send / open-thread / open-list. Phone-verified gate (D-114) is
// enforced on createConversation + sendMessage (write paths).

import { createClient } from "@/lib/supabase/server";
import { isPhoneVerified } from "@/lib/auth";
import { getProductImagePublicUrl } from "@/lib/storage";
import { runMessageFilter, blockReason, logFilterAction } from "./filters";
import { dispatchNewMessageEmail } from "@/lib/notifications/send-message-notification";
import type {
  CreateConversationResult,
  SendMessageResult,
  SendImageMessageResult,
  ReportMessageResult,
  MarkReadResult,
  GetMessagesResult,
  ListConversationsResult,
  ConversationSummary,
  MessageRow,
} from "./types";

const MAX_LEN = 2000;

/** Best-effort last_seen_at touch (D-109). Never throws. */
async function touchLastSeen(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  try {
    await supabase
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", userId);
  } catch (err) {
    console.error(
      "[touchLastSeen] failed",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Resolve the signed-in user + their phone-verified status + tier. */
async function resolveActor(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null as null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("verification_status, tier")
    .eq("id", user.id)
    .maybeSingle();
  return {
    user,
    phoneVerified: isPhoneVerified(profile?.verification_status),
    tier: (profile?.tier as string) ?? "free",
  };
}

// --- Action 1: createConversation -------------------------------------------

export async function createConversation(
  listingId: string,
  firstMessageContent: string,
  templateId?: string,
  templateEdited?: boolean,
): Promise<CreateConversationResult> {
  const supabase = createClient();
  const actor = await resolveActor(supabase);
  if (!actor.user) return { error: "Unauthorized" };
  if (!actor.phoneVerified) return { error: "PhoneVerificationRequired" };

  const content = firstMessageContent.trim();
  if (!content) return { error: "Empty" };
  if (content.length > MAX_LEN) return { error: "TooLong" };

  // Listing must exist + be published (status='active'); can't message own listing.
  const { data: listing } = await supabase
    .from("products")
    .select("id, seller_id, status")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing || listing.status !== "active") return { error: "NotFound" };
  if (listing.seller_id === actor.user.id) return { error: "Forbidden" };

  // Existing buyer_seller conversation? Return it (partial unique index also guards).
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("buyer_id", actor.user.id)
    .eq("seller_id", listing.seller_id)
    .eq("listing_id", listingId)
    .eq("conversation_type", "buyer_seller")
    .maybeSingle();
  if (existing) return { conversationId: existing.id };

  // D-110 filter BEFORE any write (reject-outright; no orphan rows). Fail closed.
  let filter;
  try {
    filter = await runMessageFilter(content, actor.tier);
  } catch (err) {
    console.error("[createConversation] filter unavailable", err);
    return { error: "FilterUnavailable" };
  }
  if (filter.action === "block") {
    // K-038: log block events so admin review + D-114 repeat-violation
    // escalation can see them. messageId is null (no message was created);
    // userProceeded is false (block prevented the send).
    await logFilterAction({
      userId: actor.user.id,
      messageId: null,
      result: filter,
      content,
      userProceeded: false,
    });
    return { error: "ContentBlocked", reason: blockReason(filter.rule) };
  }

  // Create conversation, then first message. If the message insert fails,
  // best-effort delete the conversation so we don't leave an orphan.
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .insert({
      buyer_id: actor.user.id,
      seller_id: listing.seller_id,
      listing_id: listingId,
    })
    .select("id")
    .single();
  if (convErr || !conv) {
    console.error("[createConversation] conversation insert failed", convErr?.message);
    return { error: "Unknown" };
  }

  const metadata: Record<string, unknown> = {};
  if (templateId) metadata.template_id = templateId;
  if (templateEdited) metadata.template_edited = true;
  if (filter.action === "warn") metadata.contains_warning = true;

  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .insert({
      conversation_id: conv.id,
      sender_id: actor.user.id,
      message_type: "text",
      content,
      metadata,
    })
    .select("id")
    .single();
  if (msgErr || !msg) {
    console.error("[createConversation] message insert failed", msgErr?.message);
    await supabase.from("conversations").delete().eq("id", conv.id); // avoid orphan
    return { error: "Unknown" };
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), last_message_type: "text" })
    .eq("id", conv.id);

  await touchLastSeen(supabase, actor.user.id);
  await logFilterAction({
    userId: actor.user.id,
    messageId: msg.id,
    result: filter,
    content,
    userProceeded: true,
  });

  // TC-023: best-effort email if recipient (seller, here) is offline. Never
  // throws; logs internally. Awaited so it doesn't get cut off mid-call on
  // Cloudflare's Edge runtime (no waitUntil here yet).
  await dispatchNewMessageEmail({
    recipientId: listing.seller_id,
    senderId: actor.user.id,
    conversationId: conv.id,
    messageContent: content,
  });

  return { conversationId: conv.id };
}

// --- Action 2: sendMessage ---------------------------------------------------

export async function sendMessage(
  conversationId: string,
  content: string,
): Promise<SendMessageResult> {
  const supabase = createClient();
  const actor = await resolveActor(supabase);
  if (!actor.user) return { error: "Unauthorized" };
  if (!actor.phoneVerified) return { error: "PhoneVerificationRequired" };

  const text = content.trim();
  if (!text) return { error: "Empty" };
  if (text.length > MAX_LEN) return { error: "TooLong" };

  // Participant check (RLS also enforces; explicit check gives a clean error).
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return { error: "NotFound" };
  if (conv.buyer_id !== actor.user.id && conv.seller_id !== actor.user.id) {
    return { error: "Forbidden" };
  }

  let filter;
  try {
    filter = await runMessageFilter(text, actor.tier);
  } catch (err) {
    console.error("[sendMessage] filter unavailable", err);
    return { error: "FilterUnavailable" };
  }
  if (filter.action === "block") {
    // K-038: log block events (see createConversation for rationale).
    await logFilterAction({
      userId: actor.user.id,
      messageId: null,
      result: filter,
      content: text,
      userProceeded: false,
    });
    return { error: "ContentBlocked", reason: blockReason(filter.rule) };
  }

  const metadata: Record<string, unknown> = {};
  if (filter.action === "warn") metadata.contains_warning = true;

  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: actor.user.id,
      message_type: "text",
      content: text,
      metadata,
    })
    .select("id")
    .single();
  if (msgErr || !msg) {
    console.error("[sendMessage] insert failed", msgErr?.message);
    return { error: "Unknown" };
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), last_message_type: "text" })
    .eq("id", conversationId);

  await touchLastSeen(supabase, actor.user.id);
  await logFilterAction({
    userId: actor.user.id,
    messageId: msg.id,
    result: filter,
    content: text,
    userProceeded: true,
  });

  // TC-023: best-effort email if recipient is offline. Recipient is whichever
  // party in this conversation isn't the sender. Dispatcher is fire-and-await:
  // never throws (errors logged inside), respects offline threshold +
  // notification_preferences + 10-min suppression window.
  const recipientId =
    conv.buyer_id === actor.user.id ? conv.seller_id : conv.buyer_id;
  await dispatchNewMessageEmail({
    recipientId,
    senderId: actor.user.id,
    conversationId,
    messageContent: text,
  });

  return {
    messageId: msg.id,
    containsWarning: filter.action === "warn" ? true : undefined,
  };
}

// --- Action 5: markConversationAsRead ---------------------------------------

/** Shared: mark all messages NOT sent by `userId` as read in this conversation. */
async function markRead(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("sender_id", userId)
    .is("read_at", null);
}

export async function markConversationAsRead(
  conversationId: string,
): Promise<MarkReadResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return { error: "NotFound" };
  if (conv.buyer_id !== user.id && conv.seller_id !== user.id) {
    return { error: "Forbidden" };
  }

  await markRead(supabase, conversationId, user.id);
  await touchLastSeen(supabase, user.id);
  return { ok: true };
}

// --- Action 4: getMessages ---------------------------------------------------

export async function getMessages(
  conversationId: string,
  limit = 50,
  before?: string, // message id to load older than
): Promise<GetMessagesResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return { error: "NotFound" };
  if (conv.buyer_id !== user.id && conv.seller_id !== user.id) {
    return { error: "Forbidden" };
  }

  const capped = Math.min(Math.max(limit, 1), 100);

  // Keyset cursor: load messages older than the `before` message's created_at.
  let beforeTs: string | null = null;
  if (before) {
    const { data: anchor } = await supabase
      .from("messages")
      .select("created_at")
      .eq("id", before)
      .eq("conversation_id", conversationId)
      .maybeSingle();
    beforeTs = anchor?.created_at ?? null;
  }

  let q = supabase
    .from("messages")
    .select(
      "id, conversation_id, sender_id, message_type, content, metadata, attachment_url, read_at, created_at",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(capped + 1);
  if (beforeTs) q = q.lt("created_at", beforeTs);

  const { data, error } = await q;
  if (error) {
    console.error("[getMessages] query failed", error.message);
    return { error: "Unknown" };
  }

  const rows = data ?? [];
  const hasMore = rows.length > capped;
  const page = (hasMore ? rows.slice(0, capped) : rows).reverse(); // chronological

  const messages: MessageRow[] = page.map((m) => ({
    id: m.id as string,
    conversationId: m.conversation_id as string,
    senderId: m.sender_id as string,
    messageType: m.message_type as string,
    content: (m.content as string | null) ?? null,
    metadata: (m.metadata as Record<string, unknown>) ?? {},
    attachmentUrl: (m.attachment_url as string | null) ?? null,
    readAt: (m.read_at as string | null) ?? null,
    createdAt: m.created_at as string,
  }));

  // Opening a thread marks the other party's messages read + touches last_seen.
  await markRead(supabase, conversationId, user.id);
  await touchLastSeen(supabase, user.id);

  return { messages, hasMore };
}

// --- Action 3: listConversations --------------------------------------------

interface CursorParts {
  ts: string;
  id: string;
}
function encodeCursor(c: CursorParts): string {
  return Buffer.from(`${c.ts}|${c.id}`).toString("base64");
}
function decodeCursor(s: string): CursorParts | null {
  try {
    const [ts, id] = Buffer.from(s, "base64").toString("utf8").split("|");
    if (!ts || !id) return null;
    return { ts, id };
  } catch {
    return null;
  }
}

export async function listConversations(
  role: "buyer" | "seller" | "all" = "all",
  limit = 20,
  cursor?: string,
): Promise<ListConversationsResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  const me = user.id;
  const capped = Math.min(Math.max(limit, 1), 50);

  // FK constraint names are the Postgres-default `_fkey` form (verified
  // 2026-05-22). profiles is referenced twice (buyer/seller) so the embed MUST
  // disambiguate via the explicit constraint name (MEMORY: exact-FK-name rule).
  let q = supabase
    .from("conversations")
    .select(
      `
      id, buyer_id, seller_id, listing_id, last_message_at, last_message_type, status, created_at,
      buyer:profiles!conversations_buyer_id_fkey(id, display_name, verification_status, last_seen_at),
      seller:profiles!conversations_seller_id_fkey(id, display_name, verification_status, last_seen_at),
      listing:products!conversations_listing_id_fkey(id, title, price_kobo, status)
    `,
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(capped + 1);

  if (role === "buyer") q = q.eq("buyer_id", me);
  else if (role === "seller") q = q.eq("seller_id", me);
  else q = q.or(`buyer_id.eq.${me},seller_id.eq.${me}`);

  const cur = cursor ? decodeCursor(cursor) : null;
  if (cur) {
    // Keyset on (last_message_at DESC, id DESC). All real conversations have a
    // last_message_at (first message sets it), so null handling is unneeded here.
    q = q.or(
      `last_message_at.lt.${cur.ts},and(last_message_at.eq.${cur.ts},id.lt.${cur.id})`,
    );
  }

  const { data, error } = await q;
  if (error) {
    console.error("[listConversations] query failed", error.message);
    return { error: "Unknown" };
  }

  const rows = data ?? [];
  const hasMore = rows.length > capped;
  const page = hasMore ? rows.slice(0, capped) : rows;
  const ids = page.map((r) => r.id as string);

  // Last message + unread count in one messages query (avoids per-row N+1).
  const previewById = new Map<
    string,
    { content: string | null; senderId: string; messageType: string; createdAt: string }
  >();
  const unreadById = new Map<string, number>();
  if (ids.length > 0) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id, sender_id, content, message_type, read_at, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false });
    for (const m of msgs ?? []) {
      const cid = m.conversation_id as string;
      if (!previewById.has(cid)) {
        previewById.set(cid, {
          content: (m.content as string | null) ?? null,
          senderId: m.sender_id as string,
          messageType: m.message_type as string,
          createdAt: m.created_at as string,
        });
      }
      if (m.read_at === null && (m.sender_id as string) !== me) {
        unreadById.set(cid, (unreadById.get(cid) ?? 0) + 1);
      }
    }
  }

  // Primary listing thumbnail per row (Commit 2 — B1 placeholder for missing).
  // Single batched product_images query, ORDER BY position then earliest, then
  // take the first row per listing. Avoids N+1.
  const listingIds: string[] = [];
  for (const r of page) {
    const lid = r.listing_id as string | null;
    if (lid && !listingIds.includes(lid)) listingIds.push(lid);
  }
  const primaryImageByListing = new Map<string, string>();
  if (listingIds.length > 0) {
    const { data: imgs } = await supabase
      .from("product_images")
      .select("product_id, storage_path, position")
      .in("product_id", listingIds)
      .order("position", { ascending: true });
    for (const img of imgs ?? []) {
      const pid = img.product_id as string;
      if (!primaryImageByListing.has(pid)) {
        primaryImageByListing.set(
          pid,
          getProductImagePublicUrl(img.storage_path as string),
        );
      }
    }
  }

  const pickOne = <T>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const conversations: ConversationSummary[] = page.map((r) => {
    const isBuyer = (r.buyer_id as string) === me;
    const otherRaw = pickOne(isBuyer ? r.seller : r.buyer) as
      | { id: string; display_name: string | null; verification_status: string[] | null; last_seen_at: string | null }
      | null;
    const listingRaw = pickOne(r.listing) as
      | { id: string; title: string | null; price_kobo: number | null; status: string }
      | null;
    return {
      id: r.id as string,
      role: isBuyer ? "buyer" : "seller",
      otherParty: {
        id: otherRaw?.id ?? "",
        displayName: otherRaw?.display_name ?? "—",
        verificationStatus: otherRaw?.verification_status ?? [],
        lastSeenAt: otherRaw?.last_seen_at ?? null,
      },
      listing: listingRaw
        ? {
            id: listingRaw.id,
            // D-121 (Commit 4.2): unify the "listing context is unavailable"
            // copy across the messaging surface. ThreadHeader shows
            // "Listing removed" when the listing embed is null; mirror that
            // here when the listing exists but the title is null/empty so
            // the row never reads as "—".
            title: listingRaw.title ?? "Listing removed",
            priceKobo: listingRaw.price_kobo ?? null,
            status: listingRaw.status,
            primaryImageUrl: primaryImageByListing.get(listingRaw.id) ?? null,
          }
        : null,
      lastMessage: previewById.get(r.id as string) ?? null,
      unreadCount: unreadById.get(r.id as string) ?? 0,
      lastMessageAt: (r.last_message_at as string | null) ?? null,
      status: (r.status as string) ?? "active",
    };
  });

  await touchLastSeen(supabase, me);

  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last && last.last_message_at
      ? encodeCursor({ ts: last.last_message_at as string, id: last.id as string })
      : null;

  return { conversations, nextCursor };
}

// --- Action 6: sendImageMessage (Stage 2.C Commit 9) ------------------------
//
// Inserts an image-typed message row + one message_images row per attachment.
// The CLIENT has already:
//   1. Compressed each image client-side (canvas → JPEG q=0.85, ≤1600px).
//   2. Minted signed-upload URLs via mintMessageImageUploadUrls() against a
//      client-generated tempMessageId UUID.
//   3. Uploaded each blob via XHR PUT to the signed URL (per-image progress
//      reported back through the realtime reducer).
//   4. Confirmed all uploads completed (or, on partial success, dismissed
//      the failed ones and proceeded with the rest).
//
// This action ONLY inserts the DB rows. It does NOT touch Storage. The
// tempMessageId becomes messages.id (transparent reuse so the path
// `message-images/{conversation_id}/{tempMessageId}/...` matches the
// final message row's id without a rename).
//
// Caption filter (§9): D-119 runs on the caption text. If blocked, NO rows
// are inserted (caller will surface the failed bubble with editable caption
// per §9.B; storage objects already uploaded become orphans handled by the
// K-010 cleanup pattern OR by the caller's best-effort dismiss path).
export async function sendImageMessage(
  conversationId: string,
  tempMessageId: string,
  images: Array<{ position: number; storagePath: string; width: number; height: number; byteSize: number; mimeType: string }>,
  caption: string | null,
): Promise<SendImageMessageResult> {
  const supabase = createClient();
  const actor = await resolveActor(supabase);
  if (!actor.user) return { error: "Unauthorized" };
  if (!actor.phoneVerified) return { error: "PhoneVerificationRequired" };

  if (images.length === 0 || images.length > 3) return { error: "Empty" };
  // Validate positions are unique and in [0,2].
  const positions = new Set<number>();
  for (const img of images) {
    if (img.position < 0 || img.position > 2) return { error: "Empty" };
    if (positions.has(img.position)) return { error: "Empty" };
    positions.add(img.position);
  }

  // Optional caption is filtered server-side. Empty caption skips the filter.
  const captionText = (caption ?? "").trim();
  if (captionText.length > MAX_LEN) return { error: "TooLong" };

  // Participant check.
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return { error: "NotFound" };
  if (conv.buyer_id !== actor.user.id && conv.seller_id !== actor.user.id) {
    return { error: "Forbidden" };
  }

  let filter;
  if (captionText.length > 0) {
    try {
      filter = await runMessageFilter(captionText, actor.tier);
    } catch (err) {
      console.error("[sendImageMessage] filter unavailable", err);
      return { error: "FilterUnavailable" };
    }
    if (filter.action === "block") {
      await logFilterAction({
        userId: actor.user.id,
        messageId: null,
        result: filter,
        content: captionText,
        userProceeded: false,
      });
      return { error: "ContentBlocked", reason: blockReason(filter.rule) };
    }
  }

  const metadata: Record<string, unknown> = { has_images: true };
  if (filter && filter.action === "warn") metadata.contains_warning = true;

  // Insert the message row with the client-supplied id (transparent reuse
  // so the storage paths already keyed by tempMessageId align).
  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .insert({
      id: tempMessageId,
      conversation_id: conversationId,
      sender_id: actor.user.id,
      message_type: "image",
      content: captionText.length > 0 ? captionText : null,
      metadata,
    })
    .select("id")
    .single();
  if (msgErr || !msg) {
    console.error("[sendImageMessage] message insert failed", msgErr?.message);
    return { error: "Unknown" };
  }

  // Insert image rows in a single batch. Any failure rolls back the
  // message row via cascade-on-delete (we delete the message; CASCADE
  // takes care of the partial children if any committed).
  const imageRows = images.map((img) => ({
    message_id: msg.id,
    storage_path: img.storagePath,
    position: img.position,
    width: img.width,
    height: img.height,
    byte_size: img.byteSize,
    mime_type: img.mimeType,
  }));
  const { error: imgErr } = await supabase
    .from("message_images")
    .insert(imageRows);
  if (imgErr) {
    console.error("[sendImageMessage] images insert failed", imgErr.message);
    await supabase.from("messages").delete().eq("id", msg.id);
    return { error: "Unknown" };
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), last_message_type: "image" })
    .eq("id", conversationId);

  await touchLastSeen(supabase, actor.user.id);
  if (filter) {
    await logFilterAction({
      userId: actor.user.id,
      messageId: msg.id,
      result: filter,
      content: captionText,
      userProceeded: true,
    });
  }

  // Offline-recipient email — reuse the existing path. Preview shows
  // "📷 Photo" + caption excerpt when offline.
  const recipientId =
    conv.buyer_id === actor.user.id ? conv.seller_id : conv.buyer_id;
  const previewText =
    captionText.length > 0 ? `📷 ${captionText}` : "📷 Photo";
  await dispatchNewMessageEmail({
    recipientId,
    senderId: actor.user.id,
    conversationId,
    messageContent: previewText,
  });

  return {
    messageId: msg.id,
    containsWarning: filter && filter.action === "warn" ? true : undefined,
  };
}

// --- Action 7: reportMessage (Stage 2.C Commit 9) ---------------------------
//
// User-filed moderation report against a message (and any images in it).
// MVP scope (per surface findings §10.C): target_type='message' — admin
// queue picks up the whole message row + its message_images children. No
// per-image enum value yet.
//
// reasons[] are short chip labels; details is the optional textarea (≤200
// chars per CHECK on reports.description).
export async function reportMessage(
  messageId: string,
  reason: string,
  details: string | null,
): Promise<ReportMessageResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const trimmedReason = reason.trim().slice(0, 80);
  if (!trimmedReason) return { error: "Empty" };
  const trimmedDetails = (details ?? "").trim().slice(0, 200);

  // Verify the message exists AND the reporter can see it (participant).
  // We don't need to look up the conversation directly — RLS on messages
  // already filters to rows the user can read. If the SELECT returns 0
  // rows, the user is not authorized to report (NotFound is the safer
  // error message — doesn't leak existence to non-participants).
  const { data: msg } = await supabase
    .from("messages")
    .select("id")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return { error: "NotFound" };

  const { error: insertErr } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_type: "message",
    target_id: messageId,
    reason: trimmedReason,
    description: trimmedDetails.length > 0 ? trimmedDetails : null,
  });
  if (insertErr) {
    console.error("[reportMessage] insert failed", insertErr.message);
    return { error: "Unknown" };
  }

  return { ok: true };
}
