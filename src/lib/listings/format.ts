/**
 * Format kobo (integer) as Naira string with thousands separators.
 * Example: 200_000_000 -> "₦2,000,000"
 * D-008: Naira only. Stored as kobo (integer); displayed in Naira (whole units).
 */
export function formatNaira(kobo: number | bigint): string {
  const value = typeof kobo === "bigint" ? Number(kobo) : kobo;
  const naira = Math.floor(value / 100);
  return "₦" + naira.toLocaleString("en-NG");
}

/**
 * Parse a Naira input string back to kobo for storage.
 * Accepts:
 *   "2,000,000" -> 200000000
 *   "₦2,000,000" -> 200000000
 *   "2000000" -> 200000000
 *   "2,000,000.50" -> 200000050
 * Returns null if not parseable.
 */
export function parseNairaInputToKobo(input: string): number | null {
  if (!input) return null;
  const cleaned = input.replace(/[₦,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const naira = parseFloat(cleaned);
  return Math.round(naira * 100);
}

/**
 * Truncate a string at word boundaries to roughly maxChars.
 */
export function truncate(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice) + "…";
}

/**
 * Relative time string for "Posted 2 days ago" etc.
 * Pure JS, no library.
 */
export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/**
 * Validate a URL string. Returns true for http/https URLs only.
 * Used for image URL inputs in Phase C (real upload is Phase C.5).
 */
export function isValidImageUrl(url: string): boolean {
  if (!url || !url.trim()) return false;
  try {
    const u = new URL(url.trim());
    if (!["http:", "https:"].includes(u.protocol)) return false;
    // Plausible image extension check (not strict — the URL might serve dynamic images)
    return true;
  } catch {
    return false;
  }
}
