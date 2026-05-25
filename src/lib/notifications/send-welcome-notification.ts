// Stage 2.C Commit 10-c — TC-025 dispatcher for the welcome email.
// Server-only. Best-effort, never throws — mirrors the Commit 8 +
// 10-b dispatcher pattern (DB write / state change is source of truth;
// email is a one-time notification).
//
// Triggered from verifyPhoneOtpAction's success path (otp-actions.ts)
// after mark_phone_verified RPC returns true — DP-9 lock, D-114
// alignment. The natural one-shot trigger property of that RPC
// (atomic-consume the verification record) provides primary idempotence.
// We add a notification_log subject-based dedup as belt-and-braces
// against admin re-issuance of phone verification or any future flow
// that might invoke the dispatcher a second time.
//
// Welcome is NOT a notification_event enum value (intentional — it's
// transactional one-time, not preference-controllable per Frank's
// spec). So:
//   - No notification_preferences check (welcome can't be opted out
//     at MVP; the /settings/notifications UI shows it as a static
//     disabled tile only).
//   - notification_log entry uses event_type=NULL (the column is
//     nullable; NULL signals "outside the standard taxonomy").
//   - Dedup query matches on (user_id, channel='email',
//     subject='Welcome to ShowMePrice').

import { render } from "@react-email/render";
import { createAdminClient } from "@/lib/supabase/admin";
import { WelcomeEmail } from "./templates/WelcomeEmail";
import {
  getResendClient,
  NOTIFICATIONS_FROM,
  NOTIFICATIONS_REPLY_TO,
} from "./resend";

const WELCOME_SUBJECT = "Welcome to ShowMePrice";

interface DispatchParams {
  /** The user id (= profiles.id = auth.users.id) whose phone just verified. */
  userId: string;
}

function resolveAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://showmeprice-ng-v2.pages.dev"
  );
}

export async function dispatchWelcomeEmail(
  params: DispatchParams,
): Promise<void> {
  try {
    await dispatchInner(params);
  } catch (err) {
    // Best-effort: log + swallow; never surface to caller. The phone
    // verification has already succeeded — the welcome email is the
    // notification, not the verification itself.
    console.error(
      "[notifications] dispatchWelcomeEmail failed",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function dispatchInner(params: DispatchParams): Promise<void> {
  const { userId } = params;

  // Service-role client — needs RLS-bypassing reads on profiles +
  // auth.users + notification_log writes on behalf of the user.
  const admin = createAdminClient();

  // 1. Idempotence: dedup against any prior welcome dispatch for this
  //    user. Subject-based match because welcome isn't in the enum.
  const { data: prior } = await admin
    .from("notification_log")
    .select("id")
    .eq("user_id", userId)
    .eq("channel", "email")
    .eq("subject", WELCOME_SUBJECT)
    .limit(1);
  if (prior && prior.length > 0) {
    // Already welcomed. The natural one-shot trigger from
    // verifyPhoneOtpAction should prevent this; this guard is
    // belt-and-braces against any future flow that might re-trigger.
    return;
  }

  // 2. Look up display name (for greeting) + email address.
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  const userName = (profile?.display_name as string | null) ?? null;

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const toEmail = authUser?.user?.email;
  if (!toEmail) {
    console.warn(
      "[notifications] no email for welcome recipient — skip dispatch",
      userId,
    );
    return;
  }

  // 3. Render + send via Resend (best-effort).
  const resend = getResendClient();
  const appUrl = resolveAppUrl();

  if (!resend) {
    // No RESEND_API_KEY — log an in_app row only so the audit trail is
    // consistent (and the dedup guard above will still see this entry
    // on future calls). Treats local dev / missing env gracefully.
    await admin.from("notification_log").insert({
      user_id: userId,
      event_type: null,
      channel: "in_app",
      conversation_id: null,
      subject: WELCOME_SUBJECT,
      body: null,
    });
    return;
  }

  const html = await render(WelcomeEmail({ userName, appUrl }));
  const plainText = await render(WelcomeEmail({ userName, appUrl }), {
    plainText: true,
  });

  const { data: sent, error: sendErr } = await resend.emails.send({
    from: NOTIFICATIONS_FROM,
    to: toEmail,
    replyTo: NOTIFICATIONS_REPLY_TO,
    subject: WELCOME_SUBJECT,
    html,
    text: plainText,
  });

  // 4. Always log the dispatch attempt (success or failure) so the
  //    dedup guard works on real wire activity, not just successes.
  await admin.from("notification_log").insert({
    user_id: userId,
    event_type: null,
    channel: "email",
    conversation_id: null,
    subject: WELCOME_SUBJECT,
    body: "Welcome email sent post phone-verify completion",
    provider_reference:
      sent?.id ?? (sendErr ? `error: ${sendErr.message}` : null),
  });

  if (sendErr) {
    console.error(
      "[notifications] Resend welcome send failed",
      sendErr.message,
    );
  }
}
