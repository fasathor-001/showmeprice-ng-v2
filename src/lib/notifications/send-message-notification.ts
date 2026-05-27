// Stage 2.C Commit 8 — TC-023 dispatcher for the offline-recipient
// new-message email. Server-only. Best-effort, never throws.
//
// Hybrid debounce strategy (per Frank's approved §6.I + §6.J logic):
//   1. If recipient's last_seen_at < 30 seconds stale → SKIP (online).
//   2. Honor notification_preferences.email_enabled for 'new_message'.
//   3. Suppression query: if any email row exists in notification_log for
//      this (recipient, conversation, 'new_message', email) within the
//      last 10 minutes → SUPPRESS.
//   4. Otherwise: render template, send via Resend, log a notification_log
//      row carrying sent_at, channel, provider_reference.
//
// NULL conversation_id rows (welcome/verification emails in Commit 10) are
// correctly never matched by the suppression query — desired behavior.
//
// Called from sendMessage + createConversation in src/lib/messaging/actions.ts
// AFTER the messages row insert succeeds. Failures are logged but never
// surfaced to the caller — the message itself has already been persisted.

import { render } from "@react-email/render";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatNaira } from "@/lib/listings";
import { getProductImagePublicUrl } from "@/lib/storage";
import {
  NewMessageEmail,
} from "./templates/NewMessageEmail";
import {
  getResendClient,
  NOTIFICATIONS_FROM,
  NOTIFICATIONS_REPLY_TO,
} from "./resend";

const OFFLINE_THRESHOLD_MS = 30_000;
const SUPPRESSION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes (§6.I)

interface DispatchParams {
  recipientId: string;
  senderId: string;
  conversationId: string;
  messageContent: string;
}

/**
 * Resolve the absolute base URL for links in the email body. Prefers the
 * request-origin pattern used elsewhere (NEXT_PUBLIC_SITE_URL fallback), but
 * since we're in a fire-and-forget server context with no Request object,
 * we read from env directly. Falls back to the production pages.dev URL.
 */
function resolveAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://app.showmeprice.ng"
  );
}

export async function dispatchNewMessageEmail(
  params: DispatchParams,
): Promise<void> {
  try {
    await dispatchInner(params);
  } catch (err) {
    // §6.L: best-effort. Log + swallow; never surface to caller.
    console.error(
      "[notifications] dispatchNewMessageEmail failed",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function dispatchInner(params: DispatchParams): Promise<void> {
  const { recipientId, senderId, conversationId, messageContent } = params;

  // Service-role client — needs to read recipient's notification_preferences,
  // last_seen_at, and write notification_log on the recipient's behalf.
  // None of these reads/writes can flow through the sender's RLS context.
  const admin = createAdminClient();

  // 1. Offline check — recipient's last_seen_at must be > 30s stale.
  const { data: recipient } = await admin
    .from("profiles")
    .select("id, last_seen_at, display_name")
    .eq("id", recipientId)
    .maybeSingle();
  if (!recipient) {
    console.warn("[notifications] recipient profile not found", recipientId);
    return;
  }
  const lastSeenMs = recipient.last_seen_at
    ? new Date(recipient.last_seen_at as string).getTime()
    : 0;
  const staleness = Date.now() - lastSeenMs;
  if (staleness < OFFLINE_THRESHOLD_MS) {
    // Recipient is online; realtime push covers them.
    return;
  }

  // 2. Respect notification_preferences.email_enabled for new_message.
  // notification_preferences has a composite PK (user_id, event_type); if the
  // row is missing for this user we treat it as opted-in (the schema default
  // at signup is true).
  const { data: prefs } = await admin
    .from("notification_preferences")
    .select("email_enabled")
    .eq("user_id", recipientId)
    .eq("event_type", "new_message")
    .maybeSingle();
  if (prefs && prefs.email_enabled === false) {
    return;
  }

  // 3. Suppression window — any email row in last 10 min for this
  //    (recipient, conversation, new_message, email) → suppress.
  const { data: recent } = await admin
    .from("notification_log")
    .select("id")
    .eq("user_id", recipientId)
    .eq("event_type", "new_message")
    .eq("channel", "email")
    .eq("conversation_id", conversationId)
    .gt(
      "sent_at",
      new Date(Date.now() - SUPPRESSION_WINDOW_MS).toISOString(),
    )
    .limit(1);
  if (recent && recent.length > 0) {
    return; // within suppression window
  }

  // 4. Gather sender + listing context for the template.
  const { data: sender } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", senderId)
    .maybeSingle();
  const senderName =
    (sender?.display_name as string | null) ?? "Someone on ShowMePrice";

  // Listing context via conversation → product → product_images.
  const { data: conv } = await admin
    .from("conversations")
    .select("listing_id")
    .eq("id", conversationId)
    .maybeSingle();
  let listingTitle: string | null = null;
  let listingPriceNaira: string | null = null;
  let listingImageUrl: string | null = null;
  if (conv?.listing_id) {
    const { data: listing } = await admin
      .from("products")
      .select("title, price_kobo")
      .eq("id", conv.listing_id)
      .maybeSingle();
    if (listing) {
      listingTitle = (listing.title as string | null) ?? null;
      const kobo = listing.price_kobo as number | null;
      listingPriceNaira =
        typeof kobo === "number" ? formatNaira(kobo) : null;
    }
    const { data: img } = await admin
      .from("product_images")
      .select("storage_path")
      .eq("product_id", conv.listing_id)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (img?.storage_path) {
      listingImageUrl = getProductImagePublicUrl(img.storage_path as string);
    }
  }

  // 5. Render + send via Resend (best-effort).
  const resend = getResendClient();
  if (!resend) {
    // No RESEND_API_KEY — log an in_app row only so the audit trail is
    // consistent (recipient will discover on next visit; no worse than
    // pre-Commit-8 baseline).
    await admin.from("notification_log").insert({
      user_id: recipientId,
      event_type: "new_message",
      channel: "in_app",
      conversation_id: conversationId,
      subject: null,
      body: null,
    });
    return;
  }

  const appUrl = resolveAppUrl();
  const subject = `${senderName} sent you a message on ShowMePrice`;

  const html = await render(
    NewMessageEmail({
      senderName,
      messagePreview: messageContent,
      conversationId,
      listingTitle,
      listingPriceNaira,
      listingImageUrl,
      appUrl,
    }),
  );
  const plainText = await render(
    NewMessageEmail({
      senderName,
      messagePreview: messageContent,
      conversationId,
      listingTitle,
      listingPriceNaira,
      listingImageUrl,
      appUrl,
    }),
    { plainText: true },
  );

  // Determine the recipient email address from auth.users (RLS-bypassing
  // admin call). profiles.email doesn't exist (per K-032 — email lives in
  // auth.users.email).
  const { data: authUser } =
    await admin.auth.admin.getUserById(recipientId);
  const toEmail = authUser?.user?.email;
  if (!toEmail) {
    console.warn(
      "[notifications] no email for recipient — skip dispatch",
      recipientId,
    );
    return;
  }

  const { data: sent, error: sendErr } = await resend.emails.send({
    from: NOTIFICATIONS_FROM,
    to: toEmail,
    replyTo: NOTIFICATIONS_REPLY_TO,
    subject,
    html,
    text: plainText,
  });

  // Always log the dispatch attempt (success or failure) so the suppression
  // window operates on real wire activity rather than just successes.
  await admin.from("notification_log").insert({
    user_id: recipientId,
    event_type: "new_message",
    channel: "email",
    conversation_id: conversationId,
    subject,
    body: `Preview: ${messageContent.slice(0, 200)}`,
    provider_reference: sent?.id ?? (sendErr ? `error: ${sendErr.message}` : null),
  });

  if (sendErr) {
    console.error("[notifications] Resend send failed", sendErr.message);
  }
}
