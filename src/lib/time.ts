// Conversation-row relative-time helper (Commit 2).
//
// Pure: takes an ISO timestamp + a `now` reference. Renders in the BROWSER's
// local timezone (default `Date` behaviour) so diaspora buyers in
// London/Toronto see London/Toronto time; Nigerian users see WAT.
//
// Format rules:
//   Today                    → "14:32"  (24h, locale-default; matches NG convention)
//   Yesterday                → "Yesterday"
//   Within last 7 days       → short weekday ("Mon", "Tue")
//   Older (this year)        → "May 15"
//   Last year or earlier     → "Mar 2025"
//
// Pass `now` for testability — vitest cases freeze it. Callers in app code
// can omit; default is `new Date()`.

export function formatConversationTime(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);
  const that = startOfDay(t);
  const daysAgo = Math.round((today.getTime() - that.getTime()) / 86_400_000);

  if (daysAgo === 0) {
    // Today — show time in 24h. Avoid locale variability for the timestamp by
    // hand-formatting hours+minutes.
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo > 1 && daysAgo < 7) {
    return t.toLocaleDateString(undefined, { weekday: "short" });
  }
  if (t.getFullYear() === now.getFullYear()) {
    return t.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return t.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/**
 * D-109 last-active indicator. Renders only when the timestamp is non-null —
 * the caller decides whether to display it (asymmetric: seller-shown-to-buyer
 * yes, buyer-shown-to-seller no, per D-109).
 *
 * Format:
 *   < 5 min ago    → "Active now"
 *   < 1 hour       → "Active 23m ago"
 *   < 24 hours     → "Active 5h ago"
 *   Yesterday      → "Active yesterday"
 *   2-6 days       → "Active 3 days ago"
 *   Older          → "Active May 15"
 */
export function formatLastActive(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";

  const diffMs = now.getTime() - t.getTime();
  if (diffMs < 0) return "Active now"; // clock skew defensive
  const min = Math.floor(diffMs / 60_000);
  if (min < 5) return "Active now";
  if (min < 60) return `Active ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Active ${hr}h ago`;
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);
  const that = startOfDay(t);
  const daysAgo = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (daysAgo === 1) return "Active yesterday";
  if (daysAgo < 7) return `Active ${daysAgo} days ago`;
  return `Active ${t.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}
