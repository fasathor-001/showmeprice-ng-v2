"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchMyUnreadMessagesCount } from "@/lib/messaging/unread-action";

// Stage 2.B Commit 5.1 + 5.3 + 5.4 — global Messages icon button with a
// realtime-updating red count badge.
//
// COMMIT 5.4 fix: Frank reported "unread counter stays on the notification
// after messages are read". Root cause is two-fold:
//   1. Realtime UPDATE payload.old.read_at may be undefined in some payload
//      shapes (REPLICA IDENTITY FULL is set per K-030, but Supabase Realtime
//      doesn't always deliver complete OLD rows on UPDATE). With strict
//      "was null AND now set" detection, those events fell through silently.
//   2. There's no fallback if realtime drops an event entirely.
//
// Fixes applied:
//   - Permissive UPDATE detection: treat any non-own UPDATE where new.read_at
//     is set as a probable read transition. False positives are bounded by
//     the periodic refetch (see below) which converges to the server's truth.
//   - Periodic refetch every 30s via fetchMyUnreadMessagesCount() — safety
//     net so the count is correct within 30s even if realtime drops events.
//   - Visibility-change refetch on tab refocus — catches up after backgrounded
//     periods where realtime may have buffered.
//   - Dev-only console logging of every realtime event for diagnosis.

interface MessagesIconWithBadgeProps {
  userId: string;
  initialCount: number;
}

interface MessageRowSubset {
  id?: string;
  sender_id?: string;
  read_at?: string | null;
}

const FALLBACK_REFRESH_INTERVAL_MS = 30_000;

export function MessagesIconWithBadge({
  userId,
  initialCount,
}: MessagesIconWithBadgeProps) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  // Realtime subscription — primary update path.
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

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
            if (process.env.NODE_ENV !== "production") {
              console.log("[MessagesIconWithBadge] INSERT received:", row);
            }
            if (!row || row.sender_id === userId) return;
            setCount((c) => c + 1);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages" },
          (payload) => {
            const oldRow = payload.old as MessageRowSubset | undefined;
            const newRow = payload.new as MessageRowSubset | undefined;
            if (process.env.NODE_ENV !== "production") {
              console.log("[MessagesIconWithBadge] UPDATE received:", {
                old: oldRow,
                new: newRow,
              });
            }
            if (!newRow || newRow.sender_id === userId) return;

            // Commit 5.4 permissive detection: oldRow.read_at may be
            // undefined in some Realtime payload shapes. Use !falsy on
            // oldRow.read_at (undefined OR null both count as "was unread")
            // and !!truthy on newRow.read_at (any set value = read).
            const wasUnread = !oldRow?.read_at;
            const nowRead = !!newRow.read_at;
            if (wasUnread && nowRead) {
              setCount((c) => Math.max(0, c - 1));
            }
            // Skip the rare unread-restored case — periodic refetch handles
            // any drift if it does happen.
          },
        )
        .subscribe((status) => {
          if (process.env.NODE_ENV !== "production") {
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

  // Fallback refetch — periodic + on tab refocus. Safety net so the badge
  // converges to the server's authoritative count within 30s even if a
  // realtime event was dropped.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const fresh = await fetchMyUnreadMessagesCount();
        if (cancelled) return;
        setCount(fresh);
        if (process.env.NODE_ENV !== "production") {
          console.log("[MessagesIconWithBadge] fallback refetch:", fresh);
        }
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[MessagesIconWithBadge] refetch failed:", err);
        }
      }
    };

    // Refresh on visibility change (tab refocus from background).
    const visHandler = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", visHandler);

    // Periodic refresh as the long-tail safety net.
    const interval = setInterval(refresh, FALLBACK_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", visHandler);
      clearInterval(interval);
    };
  }, [userId]);

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
