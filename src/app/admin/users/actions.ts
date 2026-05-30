"use server";

// E.2.16.0 Step 3 — admin profile-change server actions. Both gate on
// requireAdmin, validate inputs, then invoke the matching SECURITY DEFINER
// RPC from E.2.16.0 (admin_change_user_phone / admin_change_user_location)
// via the AUTHENTICATED supabase server client — not service-role. The RPCs
// are GRANT'd to `authenticated` exactly so we can call them with the
// admin's own session; the in-function `is_admin(p_granter_id)` check is
// the real authorization gate.
//
// On success, fires the admin-profile-change email to the affected user
// (fire-and-forget — best-effort, never throws). The admin's redirect
// must not be blocked by an email-side failure.
//
// Idempotent RPC returns (false) are treated as success with a distinct
// "unchanged" toast key so the operator gets accurate feedback.
//
// E.2.20.0 / Feature J Stage 2: suspendUserAction + unsuspendUserAction
// added below. They mirror the phone/location pattern (requireAdmin gate
// → RPC via authenticated client → mapped error messages) but call the
// E.2.20.0 RPCs instead.
//
// Feature J.5: notification dispatch is now wired. Both actions fire
// dispatchAccountSuspensionNotification (best-effort, never throws)
// after the RPC succeeds — the email is a status notification, the RPC
// is the source of truth. The dispatcher is intentionally separate
// from dispatchAdminProfileChangeNotification because the suspension
// event is in a different copy class (no "previous value → new value"
// framing, no recovery CTA tied to a specific field) and the locked
// copy omits the suspension reason (Position B).

import { requireAdmin } from "@/lib/auth/require-admin";
import {
  normalizeNigerianWhatsApp,
  isPlausibleNigerianMobile,
} from "@/lib/auth";
import { dispatchAdminProfileChangeNotification } from "@/lib/notifications/send-admin-profile-change-notification";
import { dispatchAccountSuspensionNotification } from "@/lib/notifications/send-account-suspension-notification";

export interface AdminProfileChangeResult {
  ok?: boolean;
  /** RPC returned false (same-value no-op). Treat as success. */
  unchanged?: boolean;
  error?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MIN = 5;
const REASON_MAX = 500;

function authError(reason: "unauthenticated" | "not_admin"): string {
  return reason === "unauthenticated" ? "Sign in required." : "Admin only.";
}

function validateReason(reason: string): { reason: string } | { error: string } {
  const trimmed = reason.trim();
  if (trimmed.length < REASON_MIN) {
    return { error: `Reason must be at least ${REASON_MIN} characters.` };
  }
  if (trimmed.length > REASON_MAX) {
    return { error: `Reason is too long (max ${REASON_MAX} characters).` };
  }
  return { reason: trimmed };
}

function mapPhoneRpcError(message: string): string {
  const m = message.toLowerCase();
  // Triggered by EXCEPTION block in admin_change_user_phone.
  if (m.includes("already in use"))
    return "That phone number is already in use by another account.";
  if (m.includes("target user not found"))
    return "User not found. Refresh and try again.";
  if (m.includes("invalid phone format"))
    return "That phone number isn't a valid Nigerian mobile.";
  if (m.includes("reason must be between"))
    return `Reason must be between ${REASON_MIN} and ${REASON_MAX} characters.`;
  if (m.includes("insufficient_privilege") || m.includes("not an admin"))
    return "Your admin access may have been revoked. Sign in again.";
  return "Couldn't complete the phone change. Please try again.";
}

function mapLocationRpcError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("state_id not found"))
    return "Selected state is invalid. Refresh and try again.";
  if (m.includes("target user not found"))
    return "User not found. Refresh and try again.";
  if (m.includes("reason must be between"))
    return `Reason must be between ${REASON_MIN} and ${REASON_MAX} characters.`;
  if (m.includes("insufficient_privilege") || m.includes("not an admin"))
    return "Your admin access may have been revoked. Sign in again.";
  return "Couldn't complete the location change. Please try again.";
}

export async function changeUserPhoneAction(
  targetUserId: string,
  formData: FormData,
): Promise<AdminProfileChangeResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: authError(auth.reason) };

  if (!targetUserId || !UUID_RE.test(targetUserId)) {
    return { error: "Invalid user. Refresh and try again." };
  }

  const rawPhone = String(formData.get("new_phone") ?? "");
  const rawReason = String(formData.get("reason") ?? "");

  const validatedReason = validateReason(rawReason);
  if ("error" in validatedReason) return { error: validatedReason.error };

  // Normalize + sanity-check phone fail-fast (the RPC re-validates the
  // canonical form via ~ '^234\d{10}$').
  const canonical = normalizeNigerianWhatsApp(rawPhone);
  if (!canonical || !isPlausibleNigerianMobile(canonical)) {
    return { error: "Enter a valid Nigerian mobile number." };
  }

  // RPC call via the AUTHENTICATED session client. granter_id = the admin's
  // own user id; the SQL fn's is_admin(granter_id) is the real gate.
  const { data, error } = await auth.supabase.rpc("admin_change_user_phone", {
    p_target_user_id: targetUserId,
    p_new_phone: canonical,
    p_granter_id: auth.userId,
    p_reason: validatedReason.reason,
  });
  if (error) {
    console.error(
      "[changeUserPhoneAction] RPC failed",
      error.message,
      { targetUserId },
    );
    return { error: mapPhoneRpcError(error.message) };
  }

  const changed = data === true;
  if (changed) {
    // Fire-and-forget. The dispatcher's own outer try/catch swallows
    // errors; the extra try here is belt-and-braces against an unhandled
    // promise rejection bubbling up if the dispatcher's contract ever
    // changes.
    try {
      void dispatchAdminProfileChangeNotification({
        affectedUserId: targetUserId,
        changeType: "phone",
      });
    } catch (err) {
      console.error("[changeUserPhoneAction] dispatch enqueue failed", err);
    }
  }

  console.info("[changeUserPhoneAction] ok", {
    granterId: auth.userId,
    targetUserId,
    changed,
  });
  return changed ? { ok: true } : { ok: true, unchanged: true };
}

export async function changeUserLocationAction(
  targetUserId: string,
  formData: FormData,
): Promise<AdminProfileChangeResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: authError(auth.reason) };

  if (!targetUserId || !UUID_RE.test(targetUserId)) {
    return { error: "Invalid user. Refresh and try again." };
  }

  const rawStateId = String(formData.get("new_state_id") ?? "");
  const rawReason = String(formData.get("reason") ?? "");

  if (!rawStateId || !UUID_RE.test(rawStateId)) {
    return { error: "Select a valid state." };
  }
  const validatedReason = validateReason(rawReason);
  if ("error" in validatedReason) return { error: validatedReason.error };

  const { data, error } = await auth.supabase.rpc(
    "admin_change_user_location",
    {
      p_target_user_id: targetUserId,
      p_new_state_id: rawStateId,
      p_granter_id: auth.userId,
      p_reason: validatedReason.reason,
    },
  );
  if (error) {
    console.error(
      "[changeUserLocationAction] RPC failed",
      error.message,
      { targetUserId },
    );
    return { error: mapLocationRpcError(error.message) };
  }

  const changed = data === true;
  if (changed) {
    try {
      void dispatchAdminProfileChangeNotification({
        affectedUserId: targetUserId,
        changeType: "location",
      });
    } catch (err) {
      console.error("[changeUserLocationAction] dispatch enqueue failed", err);
    }
  }

  console.info("[changeUserLocationAction] ok", {
    granterId: auth.userId,
    targetUserId,
    changed,
  });
  return changed ? { ok: true } : { ok: true, unchanged: true };
}

// ----------------------------------------------------------------------
// Feature J Stage 2 — account suspension / unsuspension server actions.
// ----------------------------------------------------------------------

export interface AdminSuspensionResult {
  ok?: boolean;
  /** Discriminates between suspend / unsuspend success for caller UX. */
  action?: "account_suspended" | "account_unsuspended";
  error?: string;
}

function mapSuspendRpcError(message: string): string {
  const m = message.toLowerCase();
  // Mirrors the EXCEPTION blocks raised inside admin_suspend_user.
  if (m.includes("insufficient_privilege") || m.includes("not an admin"))
    return "Your admin access may have been revoked. Sign in again.";
  if (m.includes("self_suspension_refused"))
    return "You cannot suspend your own account.";
  if (m.includes("reason must be between"))
    return `Reason must be between ${REASON_MIN} and ${REASON_MAX} characters.`;
  if (m.includes("target user not found"))
    return "User not found. Refresh and try again.";
  if (m.includes("already suspended"))
    return "This user is already suspended.";
  return "Couldn't suspend the user. Please try again.";
}

function mapUnsuspendRpcError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("insufficient_privilege") || m.includes("not an admin"))
    return "Your admin access may have been revoked. Sign in again.";
  if (m.includes("self_unsuspension_refused"))
    return "You cannot unsuspend your own account.";
  if (m.includes("reason must be between"))
    return `Reason must be between ${REASON_MIN} and ${REASON_MAX} characters.`;
  if (m.includes("target user not found"))
    return "User not found. Refresh and try again.";
  if (m.includes("not suspended"))
    return "This user is not currently suspended.";
  return "Couldn't unsuspend the user. Please try again.";
}

export async function suspendUserAction(
  targetUserId: string,
  reason: string,
): Promise<AdminSuspensionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: authError(auth.reason) };

  if (!targetUserId || !UUID_RE.test(targetUserId)) {
    return { error: "Invalid user. Refresh and try again." };
  }

  const validatedReason = validateReason(reason);
  if ("error" in validatedReason) return { error: validatedReason.error };

  // RPC call via the AUTHENTICATED session client. The in-function
  // is_admin(p_granter_id) check is the real authorization gate; the
  // requireAdmin() above is defense-in-depth.
  //
  // admin_suspend_user RETURNS void — Supabase returns { data: null }
  // on success. Only `error` is checked.
  const { error } = await auth.supabase.rpc("admin_suspend_user", {
    p_target_user_id: targetUserId,
    p_granter_id: auth.userId,
    p_reason: validatedReason.reason,
  });
  if (error) {
    console.error(
      "[suspendUserAction] RPC failed",
      error.message,
      { targetUserId },
    );
    return { error: mapSuspendRpcError(error.message) };
  }

  // Feature J.5: fire-and-forget email notification. The dispatcher's
  // outer try/catch swallows errors; the extra try here is belt-and-
  // braces against an unhandled promise rejection bubbling up if the
  // dispatcher's contract ever changes. Mirrors the change-phone
  // dispatch shape (lines 128–143).
  try {
    void dispatchAccountSuspensionNotification({
      affectedUserId: targetUserId,
      eventType: "suspended",
    });
  } catch (err) {
    console.error("[suspendUserAction] dispatch enqueue failed", err);
  }

  console.info("[suspendUserAction] ok", {
    granterId: auth.userId,
    targetUserId,
  });
  return { ok: true, action: "account_suspended" };
}

export async function unsuspendUserAction(
  targetUserId: string,
  reason: string,
): Promise<AdminSuspensionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: authError(auth.reason) };

  if (!targetUserId || !UUID_RE.test(targetUserId)) {
    return { error: "Invalid user. Refresh and try again." };
  }

  const validatedReason = validateReason(reason);
  if ("error" in validatedReason) return { error: validatedReason.error };

  const { error } = await auth.supabase.rpc("admin_unsuspend_user", {
    p_target_user_id: targetUserId,
    p_granter_id: auth.userId,
    p_reason: validatedReason.reason,
  });
  if (error) {
    console.error(
      "[unsuspendUserAction] RPC failed",
      error.message,
      { targetUserId },
    );
    return { error: mapUnsuspendRpcError(error.message) };
  }

  // Feature J.5: fire-and-forget restoration email notification. Same
  // pattern as suspendUserAction above, with eventType="unsuspended".
  try {
    void dispatchAccountSuspensionNotification({
      affectedUserId: targetUserId,
      eventType: "unsuspended",
    });
  } catch (err) {
    console.error("[unsuspendUserAction] dispatch enqueue failed", err);
  }

  console.info("[unsuspendUserAction] ok", {
    granterId: auth.userId,
    targetUserId,
  });
  return { ok: true, action: "account_unsuspended" };
}
