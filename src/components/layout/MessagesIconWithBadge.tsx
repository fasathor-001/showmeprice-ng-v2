"use client";

import Link from "next/link";
import { useUnreadMessagesCount } from "./UnreadMessagesProvider";

// Stage 2.B Commit 6 — Header Messages icon button.
//
// Simplified in Commit 6: consumes the shared count from UnreadMessagesProvider
// instead of owning its own realtime subscription. The provider centralises
// the subscription so the icon AND the UserMenu avatar dot read the same
// realtime-updated count (K-040 closeout). Previous per-component
// subscription, auth-race fix, permissive UPDATE detection, and fallback
// refetch — all moved up into the provider in this commit.

export function MessagesIconWithBadge() {
  const count = useUnreadMessagesCount();

  const display = count > 99 ? "99+" : String(count);
  const ariaLabel = count > 0 ? `Messages, ${count} unread` : "Messages";

  return (
    <Link
      href="/messages"
      aria-label={ariaLabel}
      className="relative inline-flex items-center justify-center w-11 h-11 rounded-full text-ink-600 hover:bg-neutral-100 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 transition-colors"
    >
      {/* Square chat icon (Commit 5.2). */}
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {count > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none ring-2 ring-white"
          aria-hidden="true"
        >
          {display}
        </span>
      )}
    </Link>
  );
}
