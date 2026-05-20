/**
 * Normalize a Nigerian WhatsApp number to E.164 without leading "+".
 *
 * Accepted inputs:
 *   "08012345678"          (local format with leading 0)
 *   "8012345678"           (without leading 0)
 *   "+2348012345678"       (international with +)
 *   "2348012345678"        (international without +)
 *   "+234 801 234 5678"    (with formatting characters)
 *   "0801-234-5678"        (with dashes)
 *
 * Returns "2348012345678" canonical form for all of the above.
 * Returns null if the number can't be normalized as Nigerian.
 *
 * D-009: WhatsApp E.164 without leading "+" (stored format).
 */
export function normalizeNigerianWhatsApp(input: string): string | null {
  if (!input) return null;

  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) return null;

  if (digits.startsWith("234") && digits.length === 13) {
    return digits;
  }
  if (digits.startsWith("0") && digits.length === 11) {
    return "234" + digits.slice(1);
  }
  if (digits.length === 10 && !digits.startsWith("0")) {
    return "234" + digits;
  }

  return null;
}

/**
 * Format a canonical NG number (2348012345678) for display as
 * "+234 801 234 5678". Returns the input unchanged if it isn't a canonical
 * 234 + 10-digit string (defensive — legacy/odd values pass through).
 */
export function formatNigerianPhone(canonical: string): string {
  if (/^234\d{10}$/.test(canonical)) {
    const n = canonical.slice(3); // 10 national digits
    return `+234 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  return canonical;
}

/**
 * Sanity check that a normalized number is a plausible Nigerian mobile.
 * NCC mobile prefixes after the 234 country code: 70, 71, 80, 81, 90, 91.
 */
export function isPlausibleNigerianMobile(normalized: string): boolean {
  if (!/^234\d{10}$/.test(normalized)) return false;
  const prefix = normalized.slice(3, 5);
  return ["70", "71", "80", "81", "90", "91"].includes(prefix);
}
