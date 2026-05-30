// Feature J.5 — dispatcher for "account suspended / restored" emails.
// Sent to the affected user after admin_suspend_user or
// admin_unsuspend_user (E.2.20.0) succeeds. Server-only. Best-effort,
// never throws — mirrors the dispatchAdminProfileChangeNotification
// shape exactly (E.2.16.0 Step 3 precedent).
//
// notification_log event_type = NULL (recovery/security-class precedent
// from the welcome + admin-profile-change dispatchers): this event is
// outside the user-facing notification taxonomy (no opt-out) so it does
// not match any notification_preferences row. Suspension status is in
// the same always-deliver class as the welcome email and the admin-
// changed-your-account email — silencing it via preferences would
// undermine the platform's account-status transparency.
//
// Called from suspendUserAction + unsuspendUserAction in
// src/app/admin/users/actions.ts AFTER the SECURITY DEFINER RPC
// succeeds. The RPC has already committed the suspension/unsuspension
// by the time the dispatcher runs — email failure cannot roll back the
// state change. Failures are logged but never surfaced to the admin
// or the affected user.
//
// Position B locked (Stage J.5 directive Q6): the suspension reason
// is NOT included in this email. The reason lives in the
// profile_admin_changes audit row for admin reference only; the
// affected user receives the status-change notification with a support
// CTA, not the operator's free-text justification.

import { render } from "@react-email/render";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AccountSuspensionEmail,
  type AccountSuspensionEventType,
} from "./templates/AccountSuspensionEmail";
import {
  getResendClient,
  NOTIFICATIONS_FROM,
  NOTIFICATIONS_REPLY_TO,
} from "./resend";

interface DispatchParams {
  /** profiles.id of the user whose account changed status (= auth.users.id). */
  affectedUserId: string;
  eventType: AccountSuspensionEventType;
}

const SUBJECT_BY_EVENT: Record<AccountSuspensionEventType, string> = {
  suspended: "Your ShowMePrice account has been suspended",
  unsuspended: "Your ShowMePrice account has been restored",
};

export async function dispatchAccountSuspensionNotification(
  params: DispatchParams,
): Promise<void> {
  try {
    await dispatchInner(params);
  } catch (err) {
    // Best-effort: log + swallow. The DB change already landed and the
    // admin's redirect should not be blocked by an email-side failure.
    console.error(
      "[notifications] dispatchAccountSuspensionNotification failed",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function dispatchInner(params: DispatchParams): Promise<void> {
  const { affectedUserId, eventType } = params;
  const subject = SUBJECT_BY_EVENT[eventType];

  // Service-role client: needs RLS-bypassing reads on profiles +
  // auth.users and writes to notification_log on behalf of the affected
  // user. Mirrors E.2.16.0 dispatcher precedent.
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
      "[notifications] no email for account-suspension subject — skip dispatch",
      affectedUserId,
    );
    return;
  }

  const resend = getResendClient();

  // 2. If Resend isn't configured, log an in_app row only — keeps the
  //    audit trail consistent (same shape as welcome / verification-
  //    decision / admin-profile-change dispatchers).
  if (!resend) {
    await admin.from("notification_log").insert({
      user_id: affectedUserId,
      event_type: null,
      channel: "in_app",
      conversation_id: null,
      subject,
      body: `Account ${eventType}`,
    });
    return;
  }

  const html = await render(AccountSuspensionEmail({ userName, eventType }));
  const plainText = await render(
    AccountSuspensionEmail({ userName, eventType }),
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

  // 3. Always log the dispatch attempt (success or failure).
  await admin.from("notification_log").insert({
    user_id: affectedUserId,
    event_type: null,
    channel: "email",
    conversation_id: null,
    subject,
    body: `Account ${eventType}`,
    provider_reference:
      sent?.id ?? (sendErr ? `error: ${sendErr.message}` : null),
  });

  if (sendErr) {
    console.error(
      "[notifications] Resend account-suspension send failed",
      sendErr.message,
    );
  }
}
