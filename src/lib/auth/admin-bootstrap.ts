// D-105 Stage 2.A.1 — admin bootstrap detection.
//
// If the authenticated user's email matches ADMIN_BOOTSTRAP_EMAIL
// (case-insensitive, trimmed), grant them admin role via the
// service_role-locked grant_admin_role SECURITY DEFINER function (triple-
// REVOKE'd in migration E.2.2.0 — only service_role can execute it, so this
// must run through the admin client, not the authenticated client).
//
// Called from BOTH post-auth paths (/auth/callback + signInAction) so the
// bootstrap fires on either signup-confirmation or existing-account signin —
// the same dual-path discipline that phoneGateDest follows (K-014).
//
// Idempotent: grant_admin_role returns false (no-op, no audit row) when the
// target is already admin. The email-match string compare is the cost gate —
// non-bootstrap users never reach the database.
//
// Never throws. Both call sites are on the login hot path; a transient DB
// failure must not break sign-in. Errors are logged and swallowed; the grant
// is idempotent and self-heals on the next signin.

import { createAdminClient } from "@/lib/supabase/admin";

let warnedMissingEnv = false;

/**
 * @returns true if a grant was just performed; false otherwise (env unset /
 *          no email match / already admin / error).
 */
export async function maybeBootstrapAdmin(
  userId: string,
  email: string,
): Promise<boolean> {
  const configured = process.env.ADMIN_BOOTSTRAP_EMAIL;
  if (!configured) {
    if (!warnedMissingEnv) {
      console.warn(
        "[maybeBootstrapAdmin] ADMIN_BOOTSTRAP_EMAIL not set — admin bootstrap disabled (existing admins unaffected)",
      );
      warnedMissingEnv = true;
    }
    return false;
  }

  // Cost gate: only the configured bootstrap email reaches the DB.
  if (email.trim().toLowerCase() !== configured.trim().toLowerCase()) {
    return false;
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("grant_admin_role", {
      p_target_user_id: userId,
      p_granter_id: null,
      p_reason: "ADMIN_BOOTSTRAP_EMAIL match on signin/signup",
    });
    if (error) {
      console.error("[maybeBootstrapAdmin] grant_admin_role RPC failed", {
        userId,
        email,
        error: error.message,
      });
      return false;
    }
    return data === true;
  } catch (err) {
    console.error("[maybeBootstrapAdmin] grant_admin_role RPC failed", {
      userId,
      email,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
