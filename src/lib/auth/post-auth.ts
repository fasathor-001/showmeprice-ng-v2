// Shared post-authentication routing gate.
//
// Both /auth/callback (email confirmation / recovery / OAuth) and signInAction
// (password sign-in) compute their own baseDest, then wrap it through this
// gate so the phone-verify soft-prompt decision lives in ONE place. The bug
// this prevents (K-014): the decision was inlined in /auth/callback only, and
// signInAction — a separate post-auth path — silently bypassed it.
//
// Pure function, no side effects. /verify-phone is a SOFT prompt (it has a
// "Skip for now" link); hard enforcement of phone_verified lives at the gated
// actions (contact-reveal, listing-creation) per decision #3.

export function phoneGateDest(
  verificationStatus: string[] | null | undefined,
  baseDest: string,
): string {
  const verified = (verificationStatus ?? []).includes("phone_verified");
  return verified
    ? baseDest
    : `/verify-phone?next=${encodeURIComponent(baseDest)}`;
}
