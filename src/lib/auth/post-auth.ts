// Shared phone-verification gate.
//
// Both /auth/callback (email confirmation / recovery / OAuth) and signInAction
// (password sign-in) compute their own baseDest, then wrap it through
// phoneGateDest so the soft-prompt routing decision lives in ONE place. The
// bug this prevents (K-014): the decision was inlined in /auth/callback only,
// and signInAction — a separate post-auth path — silently bypassed it.
//
// isPhoneVerified is the single source of truth for the "is phone_verified in
// this array?" check; phoneGateDest (soft prompt) and requirePhoneVerified
// (hard gate) both build on it.
//
// /verify-phone is a SOFT prompt (has "Skip for now"); HARD enforcement of
// phone_verified lives at the gated actions/pages (listing-creation now;
// contact-reveal when that flow ships — D-093), via requirePhoneVerified.

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

/** True if profiles.verification_status contains 'phone_verified'. */
export function isPhoneVerified(
  verificationStatus: string[] | null | undefined,
): boolean {
  return (verificationStatus ?? []).includes("phone_verified");
}

/**
 * Soft-prompt routing: returns baseDest if the phone is verified, else a
 * /verify-phone detour that returns to baseDest. Used by post-auth paths.
 */
export function phoneGateDest(
  verificationStatus: string[] | null | undefined,
  baseDest: string,
): string {
  return isPhoneVerified(verificationStatus)
    ? baseDest
    : `/verify-phone?next=${encodeURIComponent(baseDest)}`;
}

/**
 * Hard gate for pages: redirect an unverified user to /verify-phone (returning
 * them to `next` after verify/skip). Call from a server component AFTER any
 * higher-priority gate (e.g. business verification) has passed. Returns void
 * when the phone is verified.
 */
export async function requirePhoneVerified(
  supabase: SupabaseClient,
  userId: string,
  next: string,
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("verification_status")
    .eq("id", userId)
    .maybeSingle();
  if (!isPhoneVerified(profile?.verification_status)) {
    redirect(`/verify-phone?next=${encodeURIComponent(next)}`);
  }
}
