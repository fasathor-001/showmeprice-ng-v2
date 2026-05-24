// Stage 2.C Commit 8 — Resend client (server-only, transactional emails).
//
// Module shape: lazy-init singleton, read RESEND_API_KEY from env at first
// use (not at import time, so build-time `pnpm build` on Cloudflare Pages
// doesn't fail when the env var is absent in CI). Logs but never throws on
// missing key — callers should treat email send as best-effort per §6.L
// surface findings (the message itself has already been persisted; the
// email is a notification, not the conversation).

import { Resend } from "resend";

// Sender + reply-to addresses approved in §6.E. Mailbox provisioning happens
// outside this file (Frank confirms the notifications@ mailbox setup before
// Commit 8 deploys; Resend domain verification already complete for
// showmeprice.ng with SPF + DKIM + DMARC live).
export const NOTIFICATIONS_FROM = "ShowMePrice <notifications@showmeprice.ng>";
export const NOTIFICATIONS_REPLY_TO = "support@showmeprice.ng";

let cachedClient: Resend | null = null;

/**
 * Get the singleton Resend client. Returns null if RESEND_API_KEY is not
 * configured — callers MUST handle this case (see §6.L: best-effort send,
 * no user-facing error if the email path fails).
 */
export function getResendClient(): Resend | null {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[resend] RESEND_API_KEY not set — email dispatch will be skipped. " +
        "This is expected during local dev / build; provision the env var " +
        "in Cloudflare Pages before deploy.",
    );
    return null;
  }
  cachedClient = new Resend(apiKey);
  return cachedClient;
}
