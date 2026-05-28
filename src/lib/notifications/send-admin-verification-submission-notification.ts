// Admin-direction dispatcher: alerts support@showmeprice.ng when a seller
// submits ID verification (new seller_verifications row with status='pending').
//
// Server-only. Best-effort, never throws — mirrors the three sibling
// dispatchers in this directory exactly:
//   - send-welcome-notification.ts
//   - send-verification-decision-notification.ts
//   - send-message-notification.ts
//
// Triggered from submitVerificationAction in src/app/(auth)/actions.ts
// AFTER the seller_verifications row is inserted successfully. Failures
// are logged but never surfaced to the seller — the submission has
// already landed in the DB; the email is an admin alert, not the
// contract. The /admin/verifications queue is the source of truth for
// what needs review; the email is just a ping so the admin doesn't have
// to poll.
//
// DIRECTION NOTE: unlike the three sibling dispatchers (all of which send
// to a USER), this one sends to the support inbox. So:
//   - `to` is SUPPORT_NOTIFICATIONS_TO, not a user's email.
//   - No notification_preferences lookup (admin alerts aren't preference-
//     controllable by the seller — they shouldn't be able to opt out of
//     having their submission seen).
//   - No dedup-on-prior-row guard. Every submission is a real event;
//     resubmissions intentionally re-notify so the admin sees the new
//     queue entry.
//   - The notification_log row attributes the alert to the seller's
//     ownerId (the audit trail joins to the seller's history), with
//     event_type=NULL because admin-direction alerts aren't in the
//     user-facing event taxonomy (matches the welcome-email precedent).

import { render } from "@react-email/render";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminVerificationSubmissionEmail } from "./templates/AdminVerificationSubmissionEmail";
import {
  getResendClient,
  NOTIFICATIONS_FROM,
  NOTIFICATIONS_REPLY_TO,
  SUPPORT_NOTIFICATIONS_TO,
} from "./resend";

interface DispatchParams {
  /** The freshly-inserted seller_verifications.id — used to build the admin review URL. */
  submissionId: string;
  /** The submitting seller's profile id (= businesses.owner_id). Used for the notification_log attribution. */
  ownerId: string;
  /** Business id from businesses.id. Currently informational; future audit/admin queries may join on it. */
  businessId: string;
  /** Business name as it appears in businesses.business_name. Used in subject + body. */
  businessName: string;
  /** True if a prior seller_verifications row already existed for this business
   *  (computed in the calling action via the existing resubmission-detection query). */
  isResubmission: boolean;
}

function resolveAppUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.showmeprice.ng";
}

function formatSubmittedAt(d: Date): string {
  // Approximate the submission timestamp using send-time NOW(). Sub-second
  // close to the actual DB submitted_at because the dispatcher runs inline
  // immediately after the INSERT. Format mirrors what an admin would
  // recognize at a glance: "Tue 28 May 2026, 4:30 PM" in en-NG locale.
  try {
    return d.toLocaleString("en-NG", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

export async function dispatchAdminVerificationSubmissionEmail(
  params: DispatchParams,
): Promise<void> {
  try {
    await dispatchInner(params);
  } catch (err) {
    // Best-effort: log + swallow; never surface to caller. The
    // seller_verifications INSERT has already succeeded — the admin alert
    // is the notification, not the submission itself. The seller's flow
    // must not block on an email-side failure.
    console.error(
      "[notifications] dispatchAdminVerificationSubmissionEmail failed",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function dispatchInner(params: DispatchParams): Promise<void> {
  const {
    submissionId,
    ownerId,
    businessId: _businessId, // currently unused; kept on the interface for future audit/admin queries
    businessName,
    isResubmission,
  } = params;
  void _businessId;

  // Service-role client — needs RLS-bypassing read on profiles for the
  // seller's display_name, plus notification_log write.
  const admin = createAdminClient();

  // 1. Look up seller display_name (for the email body's facts list).
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", ownerId)
    .maybeSingle();
  const sellerName = (profile?.display_name as string | null) ?? null;

  // 2. Build subject + render template.
  const subject = isResubmission
    ? `[Resubmission] Seller verification pending review — ${businessName}`
    : `New seller verification pending review — ${businessName}`;

  const appUrl = resolveAppUrl();
  const submittedAtDisplay = formatSubmittedAt(new Date());

  const resend = getResendClient();

  // 3. If Resend isn't configured (local dev / missing env), log an
  //    in_app placeholder row only so the audit trail stays consistent.
  //    Mirrors the welcome + decision dispatcher pattern.
  if (!resend) {
    await admin.from("notification_log").insert({
      user_id: ownerId,
      event_type: null,
      channel: "in_app",
      conversation_id: null,
      subject,
      body: `Admin alert: ${
        isResubmission ? "resubmitted" : "new"
      } seller verification pending review (submissionId=${submissionId})`,
    });
    return;
  }

  // 4. Render + send.
  const emailEl = AdminVerificationSubmissionEmail({
    businessName,
    sellerName,
    isResubmission,
    submissionId,
    submittedAtDisplay,
    appUrl,
  });
  const html = await render(emailEl);
  const plainText = await render(emailEl, { plainText: true });

  const { data: sent, error: sendErr } = await resend.emails.send({
    from: NOTIFICATIONS_FROM,
    to: SUPPORT_NOTIFICATIONS_TO,
    replyTo: NOTIFICATIONS_REPLY_TO,
    subject,
    html,
    text: plainText,
  });

  // 5. Always log the dispatch attempt (success or failure) so the audit
  //    trail reflects real wire activity. event_type=NULL because admin-
  //    direction alerts aren't in the user-event taxonomy.
  await admin.from("notification_log").insert({
    user_id: ownerId,
    event_type: null,
    channel: "email",
    conversation_id: null,
    subject,
    body: `Admin alert (to ${SUPPORT_NOTIFICATIONS_TO}): ${
      isResubmission ? "resubmitted" : "new"
    } seller verification pending review (submissionId=${submissionId})`,
    provider_reference:
      sent?.id ?? (sendErr ? `error: ${sendErr.message}` : null),
  });

  if (sendErr) {
    console.error(
      "[notifications] Resend admin verification-submission send failed",
      sendErr.message,
    );
  }
}
