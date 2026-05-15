/**
 * Single source of truth for deriving a seller's verification state from
 * the two underlying signals:
 *
 *   - `businesses.verification_status` — canonical, only admin writes
 *     reach it (Phase A's businesses_freeze_verification trigger blocks
 *     non-admin writes).
 *   - latest `seller_verifications.status` — what the seller submitted;
 *     the only path the seller can actually drive.
 *
 * The admin approve/reject actions write both columns, so they stay in
 * sync. But before approval / rejection, the two diverge — the seller's
 * row is 'pending' while businesses.verification_status is still its
 * default 'unsubmitted'. Reading both signals is the only way to render
 * "Under review" while the row is pending.
 *
 * Used by /dashboard, /dashboard/listings, /sell, /listings/new — any
 * place that needs to branch on verification state.
 */

export type VerificationState =
  | "no_business"
  | "unsubmitted"
  | "pending"
  | "rejected"
  | "verified";

interface BusinessLike {
  verification_status: string;
}

interface SubmissionLike {
  status: string;
}

export function getVerificationState({
  business,
  latestSubmission,
}: {
  business: BusinessLike | null | undefined;
  latestSubmission: SubmissionLike | null | undefined;
}): VerificationState {
  if (!business) return "no_business";
  if (business.verification_status === "verified") return "verified";
  if (latestSubmission?.status === "pending") return "pending";
  if (
    latestSubmission?.status === "rejected" ||
    business.verification_status === "rejected"
  ) {
    return "rejected";
  }
  return "unsubmitted";
}
