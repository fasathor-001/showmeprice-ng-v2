"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Stage 2.B Commit 5.1 — global Messages icon button with a realtime-updating
// red count badge.
//
// Server-rendered initial count (from getUnreadMessagesCount, passed in as
// prop). On mount, subscribes to messages INSERT / UPDATE events and adjusts
// the local count. Supabase Realtime's RLS filtering ensures we only see
// events for messages in this user's conversations.
//
// Counter logic:
//   - INSERT where sender ≠ me → unread +1.
//   - UPDATE that transitions read_at from null → set, sender ≠ me → unread −1.
//   - UPDATE that transitions read_at from set → null, sender ≠ me → unread +1.
//
// REPLICA IDENTITY FULL on `messages` (K-030) gives us payload.old so we can
// detect the read_at transition direction.
//
// The badge styling — bg-red-500 + white number — follows iMessage / Messenger
// (D-121 reaffirmation: mature-competitor pattern for unread notifications).
// 99+ cap above three digits. Hidden entirely when count === 0 (no chrome
// for an empty state).

interface MessagesIconWithBadgeProps {
  userId: string;
  initialCount: number;
}

interface MessageRowSubset {
  id?: string;
  sender_id?: string;
  read_at?: string | null;
}

export function MessagesIconWithBadge({
  userId,
  initialCount,
}: MessagesIconWithBadgeProps) {
  const [count, setCount] = useState(initialCount);

  // Re-sync to server-rendered value on navigation (Header re-renders, prop
  // updates). Otherwise client-side realtime drift would compound over time.
  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`unread-badge-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as MessageRowSubset | undefined;
          if (!row || row.sender_id === userId) return;
          // RLS already restricted to this user's conversations. The message
          // is from someone else → bump unread.
          setCount((c) => c + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const oldRow = payload.old as MessageRowSubset | undefined;
          const newRow = payload.new as MessageRowSubset | undefined;
          if (!oldRow || !newRow) return;
          if (newRow.sender_id === userId) return; // not our unread counter
          const wasUnread = oldRow.read_at === null;
          const nowRead =
            newRow.read_at !== null && newRow.read_at !== undefined;
          if (wasUnread && nowRead) {
            setCount((c) => Math.max(0, c - 1));
          } else if (!wasUnread && newRow.read_at === null) {
            // Rare: server re-cleared read_at (e.g., admin). Defensive +1.
            setCount((c) => c + 1);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const display = count > 99 ? "99+" : String(count);
  const ariaLabel =
    count > 0
      ? `Messages, ${count} unread`
      : "Messages";

  return (
    <Link
      href="/messages"
      aria-label={ariaLabel}
      className="relative inline-flex items-center justify-center w-11 h-11 rounded-full text-ink-600 hover:bg-neutral-100 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 transition-colors"
    >
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
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
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
