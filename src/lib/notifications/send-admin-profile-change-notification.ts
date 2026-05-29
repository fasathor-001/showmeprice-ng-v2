// E.2.16.0 Step 3 — dispatcher for "admin changed your account" emails.
// Sent to the affected user after admin_change_user_phone or
// admin_change_user_location succeeds. Server-only. Best-effort, never
// throws — mirrors the dispatchVerificationDecisionEmail shape exactly.
//
// notification_log event_type = NULL (welcome-precedent): this event is
// outside the user-facing notification taxonomy (no opt-out — security
// notification) so it does not match any notification_preferences row.
// We do NOT consult notification_preferences for this dispatch; "admin
// changed your account" is in the same recovery-class as the welcome
// email and security alerts, which must always send.
//
// Called from changeUserPhoneAction + changeUserLocationAction in
// src/app/admin/users/actions.ts AFTER the RPC succeeds. Failures are
// logged but never surfaced to the admin — the DB change is the source
// of truth; the email is the notification.

import { render } from "@react-email/render";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AdminProfileChangeEmail,
  type ProfileChangeType,
} from "./templates/AdminProfileChangeEmail";
import {
  getResendClient,
  NOTIFICATIONS_FROM,
  NOTIFICATIONS_REPLY_TO,
} from "./resend";

interface DispatchParams {
  /** profiles.id of the user whose account was changed (= auth.users.id). */
  affectedUserId: string;
  changeType: ProfileChangeType;
}

function resolveAppUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.showmeprice.ng";
}

const SUBJECT = "Your ShowMePrice account was updated by support";

export async function dispatchAdminProfileChangeNotification(
  params: DispatchParams,
): Promise<void> {
  try {
    await dispatchInner(params);
  } catch (err) {
    // Best-effort: log + swallow. The DB change already landed and the
    // admin's redirect should not be blocked by an email-side failure.
    console.error(
      "[notifications] dispatchAdminProfileChangeNotification failed",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function dispatchInner(params: DispatchParams): Promise<void> {
  const { affectedUserId, changeType } = params;

  // Service-role client: needs RLS-bypassing reads on profiles + auth.users
  // and writes to notification_log on behalf of the affected user.
  const admin = createAdminClient();

  // 1. Look up display name + email. No notification_preferences check —
  //    this is in the recovery/security class (welcome-precedent).
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", affectedUserId)
    .maybeSingle();
  const userName = (profile?.display_name as string | null) ?? null;

  const { data: authUser } = await admin.auth.admin.getUserById(affectedUserId);
  const toEmail = authUser?.user?.email;
  if (!toEmail) {
    console.warn(
      "[notifications] no email for admin-profile-change subject — skip dispatch",
      affectedUserId,
    );
    return;
  }

  const resend = getResendClient();
  const appUrl = resolveAppUrl();

  // 2. If Resend isn't configured, log an in_app row only — keeps the
  //    audit trail consistent (same shape as welcome / verification-decision).
  if (!resend) {
    await admin.from("notification_log").insert({
      user_id: affectedUserId,
      event_type: null,
      channel: "in_app",
      conversation_id: null,
      subject: SUBJECT,
      body: `Admin changed account ${changeType}`,
    });
    return;
  }

  const html = await render(
    AdminProfileChangeEmail({ userName, changeType, appUrl }),
  );
  const plainText = await render(
    AdminProfileChangeEmail({ userName, changeType, appUrl }),
    { plainText: true },
  );

  const { data: sent, error: sendErr } = await resend.emails.send({
    from: NOTIFICATIONS_FROM,
    to: toEmail,
    replyTo: NOTIFICATIONS_REPLY_TO,
    subject: SUBJECT,
    html,
    text: plainText,
  });

  // 3. Always log the dispatch attempt (success or failure).
  await admin.from("notification_log").insert({
    user_id: affectedUserId,
    event_type: null,
    channel: "email",
    conversation_id: null,
    subject: SUBJECT,
    body: `Admin changed account ${changeType}`,
    provider_reference:
      sent?.id ?? (sendErr ? `error: ${sendErr.message}` : null),
  });

  if (sendErr) {
    console.error(
      "[notifications] Resend admin-profile-change send failed",
      sendErr.message,
    );
  }
}
