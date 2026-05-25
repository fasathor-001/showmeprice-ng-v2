// Stage 2.C Commit 10-b — TC-024 dispatcher for verification-decision
// emails (admin approve / reject). Server-only. Best-effort, never
// throws — mirrors the Commit 8 TC-023 send-message-notification
// shape (§6.L: DB write is source of truth, email is the notification).
//
// Single entrypoint `dispatchVerificationDecisionEmail` with a
// discriminated `decision` parameter. The approve path takes no
// rejection reason; the reject path requires one.
//
// notification_log event_type 'verification_status_change' is reused
// for both decisions — the subject and template differentiate them.
// channel='email'. conversation_id is NULL (no conversation context).
// No suppression window — verification decisions are rare per-user and
// each one is meaningful.
//
// Called from approveVerificationAction + rejectVerificationAction in
// src/app/(auth)/actions.ts AFTER the DB updates succeed. Failures are
// logged but never surfaced to the admin — the verification status has
// already changed; the email is a notification.

import { render } from "@react-email/render";
import { createAdminClient } from "@/lib/supabase/admin";
import { VerificationApprovedEmail } from "./templates/VerificationApprovedEmail";
import { VerificationRejectedEmail } from "./templates/VerificationRejectedEmail";
import {
  getResendClient,
  NOTIFICATIONS_FROM,
  NOTIFICATIONS_REPLY_TO,
} from "./resend";

type Decision =
  | { kind: "approved" }
  | { kind: "rejected"; rejectionReason: string };

interface DispatchParams {
  /** The owner_id from businesses (= profiles.id = auth.users.id). */
  ownerId: string;
  decision: Decision;
}

function resolveAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://showmeprice-ng-v2.pages.dev"
  );
}

export async function dispatchVerificationDecisionEmail(
  params: DispatchParams,
): Promise<void> {
  try {
    await dispatchInner(params);
  } catch (err) {
    // Best-effort: log + swallow; never surface to caller. The DB write
    // already happened — the admin's redirect should not be blocked by
    // an email-side failure.
    console.error(
      "[notifications] dispatchVerificationDecisionEmail failed",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function dispatchInner(params: DispatchParams): Promise<void> {
  const { ownerId, decision } = params;

  // Service-role client — needs RLS-bypassing reads on profiles +
  // auth.users + notification_log writes on behalf of the seller.
  const admin = createAdminClient();

  // 1. Respect notification_preferences.email_enabled for
  //    'verification_status_change'. Composite PK (user_id, event_type);
  //    if the row is missing for this user we treat it as opted-in
  //    (the schema default at signup is true).
  const { data: prefs } = await admin
    .from("notification_preferences")
    .select("email_enabled")
    .eq("user_id", ownerId)
    .eq("event_type", "verification_status_change")
    .maybeSingle();
  if (prefs && prefs.email_enabled === false) {
    return;
  }

  // 2. Look up seller display name (for greeting) + email.
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", ownerId)
    .maybeSingle();
  const sellerName = (profile?.display_name as string | null) ?? null;

  const { data: authUser } = await admin.auth.admin.getUserById(ownerId);
  const toEmail = authUser?.user?.email;
  if (!toEmail) {
    console.warn(
      "[notifications] no email for verification subject — skip dispatch",
      ownerId,
    );
    return;
  }

  // 3. Branch on decision — render the correct template and pick the
  //    correct subject line. Per DP-5 + DP-6 approved.
  const resend = getResendClient();
  const appUrl = resolveAppUrl();

  const subject =
    decision.kind === "approved"
      ? "Your ShowMePrice account is verified"
      : "We couldn't verify your account";

  // 4. If Resend isn't configured (local dev / missing env), log an
  //    in_app row only — the audit trail stays consistent. The seller
  //    will see the status change on next dashboard visit.
  if (!resend) {
    await admin.from("notification_log").insert({
      user_id: ownerId,
      event_type: "verification_status_change",
      channel: "in_app",
      conversation_id: null,
      subject: null,
      body: null,
    });
    return;
  }

  // Render the correct template inline. Two separate render calls per
  // branch keeps the type narrowing clean (no intermediate
  // React.ReactElement variable to type) and avoids importing the React
  // type into a non-component file.
  const html =
    decision.kind === "approved"
      ? await render(VerificationApprovedEmail({ sellerName, appUrl }))
      : await render(
          VerificationRejectedEmail({
            sellerName,
            rejectionReason: decision.rejectionReason,
            appUrl,
          }),
        );
  const plainText =
    decision.kind === "approved"
      ? await render(VerificationApprovedEmail({ sellerName, appUrl }), {
          plainText: true,
        })
      : await render(
          VerificationRejectedEmail({
            sellerName,
            rejectionReason: decision.rejectionReason,
            appUrl,
          }),
          { plainText: true },
        );

  const { data: sent, error: sendErr } = await resend.emails.send({
    from: NOTIFICATIONS_FROM,
    to: toEmail,
    replyTo: NOTIFICATIONS_REPLY_TO,
    subject,
    html,
    text: plainText,
  });

  // 5. Always log the dispatch attempt (success or failure) so the
  //    audit trail reflects real wire activity, not just successes.
  await admin.from("notification_log").insert({
    user_id: ownerId,
    event_type: "verification_status_change",
    channel: "email",
    conversation_id: null,
    subject,
    body:
      decision.kind === "approved"
        ? "Verification approved"
        : `Verification rejected: ${decision.rejectionReason.slice(0, 200)}`,
    provider_reference:
      sent?.id ?? (sendErr ? `error: ${sendErr.message}` : null),
  });

  if (sendErr) {
    console.error(
      "[notifications] Resend verification-decision send failed",
      sendErr.message,
    );
  }
}
