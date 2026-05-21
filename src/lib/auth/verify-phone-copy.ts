// Context-specific copy for /verify-phone REQUIRED mode (D-103).
//
// Single source of truth for reason-keyed heading + explanation. Add a new
// entry here when a new hard gate starts redirecting to /verify-phone with its
// own `reason` — if it's in this map, the feature exists. Do NOT pre-populate
// copy for unbuilt features (contact-reveal copy lands with D-093's commit).

export const VERIFY_PHONE_COPY: Record<
  string,
  { heading: string; explanation: string }
> = {
  listings: {
    heading: "Phone verification required",
    explanation:
      "To post listings on ShowMePrice, we need to verify your phone number. This helps buyers trust who they're contacting and protects you from fake accounts.",
  },
  default: {
    heading: "Phone verification required",
    explanation:
      "To continue on ShowMePrice, we need to verify your phone number. This helps buyers and sellers trust each other on the platform.",
  },
};

export function getVerifyPhoneCopy(reason?: string) {
  if (!reason) return VERIFY_PHONE_COPY.default;
  return VERIFY_PHONE_COPY[reason] ?? VERIFY_PHONE_COPY.default;
}
