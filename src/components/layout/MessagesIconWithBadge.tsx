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
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // Commit 5.3 fix: ensure the realtime client has the user's JWT BEFORE
    // subscribing. @supabase/ssr's browser client sets realtime auth via an
    // auth-state-change listener, but the listener may not have fired by the
    // time this useEffect runs (cookie-session load vs. subscribe race).
    // Without the JWT, realtime authenticates as anon and RLS-filtered
    // postgres_changes events on `messages` never arrive — exactly the
    // "unread counter didn't update until refresh" symptom Frank reported.
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase
        .channel(`unread-badge-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const row = payload.new as MessageRowSubset | undefined;
            if (!row || row.sender_id === userId) return;
            // RLS already restricted to this user's conversations. The
            // message is from someone else → bump unread.
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
        .subscribe((status) => {
          if (process.env.NODE_ENV !== "production") {
            // Dev-only diagnostic so subscription health is visible in
            // browser DevTools. Should log "SUBSCRIBED" once on mount.
            // Anything else (TIMED_OUT / CHANNEL_ERROR / CLOSED) signals
            // a realtime infra problem worth investigating.
            console.log(
              "[MessagesIconWithBadge] realtime subscription status:",
              status,
            );
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel);
      }
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
      {/* D-121 reaffirmation (Commit 5.2): square chat icon (rounded rect
          with a corner notch) per Frank's directive. Standard "message-square"
          glyph — same shape used in Lucide / Feather icon sets. Replaces the
          previous elliptical chat-bubble. Matched in EmptyThreadPane so the
          messaging surface uses one icon family. */}
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
