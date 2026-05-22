"use server";

// Admin role management server actions (D-105 Commit 4). Both gate on the
// shared requireAdmin guard, validate inputs, then invoke the matching
// service_role-locked SECURITY DEFINER function (grant_admin_role /
// revoke_admin_role, migration E.2.2.0) via the admin client. The SQL
// functions own authorization + audit (admin_role_changes) + idempotency;
// these actions add fail-fast validation and map RAISE EXCEPTION text to
// user-facing messages.

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export interface AdminActionResult {
  ok?: boolean;
  error?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MIN = 5;
const REASON_MAX = 500;

// Defense in depth: the SQL functions re-validate, but failing fast here gives
// clearer messages than a generic RPC error.
function validateInputs(
  targetUserId: string,
  reason: string,
): { reason: string } | { error: string } {
  if (!targetUserId || !UUID_RE.test(targetUserId)) {
    return { error: "Invalid user. Refresh and try again." };
  }
  const trimmed = reason.trim();
  if (trimmed.length < REASON_MIN) {
    return { error: `Reason must be at least ${REASON_MIN} characters.` };
  }
  if (trimmed.length > REASON_MAX) {
    return { error: `Reason is too long (max ${REASON_MAX} characters).` };
  }
  return { reason: trimmed };
}

function authError(reason: "unauthenticated" | "not_admin"): string {
  return reason === "unauthenticated" ? "Sign in required." : "Admin only.";
}

function mapGrantError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("does not exist"))
    return "User not found. Refresh and try again.";
  if (m.includes("not an active admin"))
    return "Your admin access may have been revoked. Sign in again.";
  return "Couldn't complete the action. Please try again.";
}

function mapRevokeError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("own admin role"))
    return "You cannot revoke your own admin role.";
  if (m.includes("last remaining active admin"))
    return "Cannot revoke the last admin. Grant another admin first.";
  if (m.includes("does not exist"))
    return "User not found. Refresh and try again.";
  if (m.includes("not an active admin"))
    return "Your admin access may have been revoked. Sign in again.";
  return "Couldn't complete the action. Please try again.";
}

export async function grantAdminAction(
  targetUserId: string,
  reason: string,
): Promise<AdminActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: authError(auth.reason) };

  const validated = validateInputs(targetUserId, reason);
  if ("error" in validated) return { error: validated.error };

  // p_granter_id = the calling admin → SQL routes through the 'granted'
  // (delegated) branch, not bootstrap. Idempotent: already-admin returns
  // false (no-op, no audit row) — we treat that as success.
  const admin = createAdminClient();
  const { error } = await admin.rpc("grant_admin_role", {
    p_target_user_id: targetUserId,
    p_granter_id: auth.userId,
    p_reason: validated.reason,
  });
  if (error) return { error: mapGrantError(error.message) };

  console.info("[grantAdminAction] success", {
    granterId: auth.userId,
    targetUserId,
    reason: validated.reason,
  });
  return { ok: true };
}

export async function revokeAdminAction(
  targetUserId: string,
  reason: string,
): Promise<AdminActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: authError(auth.reason) };

  const validated = validateInputs(targetUserId, reason);
  if ("error" in validated) return { error: validated.error };

  // Idempotent: non-admin target returns false (no-op) — treated as success.
  // Self-revoke and last-admin guards raise inside the SQL function.
  const admin = createAdminClient();
  const { error } = await admin.rpc("revoke_admin_role", {
    p_target_user_id: targetUserId,
    p_granter_id: auth.userId,
    p_reason: validated.reason,
  });
  if (error) return { error: mapRevokeError(error.message) };

  console.info("[revokeAdminAction] success", {
    granterId: auth.userId,
    targetUserId,
    reason: validated.reason,
  });
  return { ok: true };
}
