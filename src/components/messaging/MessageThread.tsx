"use client";

import { useEffect, useRef, useState } from "react";
import { useClientTime } from "@/lib/use-client-time";
import type { MessageRow } from "@/lib/messaging/types";
import type { ThreadMessage } from "@/lib/messaging/realtime";
import { markConversationAsRead } from "@/lib/messaging/actions";
import { useMessagesShell } from "./MessagesShell";
import { MessageBubble } from "./MessageBubble";
import { ScrollToBottom } from "./ScrollToBottom";

// Stage 2.B Commit 5 (Commit 6 polish: pagination + scroll preservation).
//
// Hydration pattern: page (Server Component) calls getMessages() server-side
// and passes the result as `initialMessages`. On mount we SEED these into the
// shell's reducer state, then read live state back from the shell. All
// subsequent updates — realtime INSERTs, optimistic sends, server
// confirmations, send failures, paginated prepend of older messages —
// flow through the shell's reducer and reactively re-render this thread.
//
// Commit 6 change: this component now OWNS the scrollable container (was
// previously a wrapping div in page.tsx). Moving it here lets the "Load
// earlier messages" handler hold a ref to the scrollable element and
// preserve scroll position when older messages prepend.

interface MessageThreadProps {
  conversationId: string;
  initialMessages: MessageRow[];
  hasMore: boolean;
  currentUserId: string;
  /** Commit 9 (TC-001) — listing context for ImageViewer's listing-chip top-bar. */
  listing?: {
    id: string;
    title: string;
    primaryImageUrl: string | null;
  } | null;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function DateDivider({ iso }: { iso: string }) {
  // Client-only formatting (Commit 5.5 hydration fix). Initial render is
  // empty on server + first client paint; useEffect populates the label
  // (Today / Yesterday / Mon, May 19 / etc.) using the user's local clock.
  const label = useClientTime(iso, "threadDivider");
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-neutral-200" />
      <span className="text-xs text-ink-400 whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-neutral-200" />
    </div>
  );
}

export function MessageThread({
  conversationId,
  initialMessages,
  hasMore,
  currentUserId,
  listing,
}: MessageThreadProps) {
  const { state, seedActive, dismissFailed, retryFailed, loadEarlierMessages } =
    useMessagesShell();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);

  // Seed shell state with the server-rendered initial messages on first mount
  // (or when the conversation changes). The reducer's SEED_ACTIVE is idempotent
  // — subsequent re-renders with the same conversationId no-op.
  useEffect(() => {
    seedActive(conversationId, initialMessages as ThreadMessage[], hasMore);
  }, [conversationId, initialMessages, hasMore, seedActive]);

  // TC-003 (Commit 8): mark conversation as read when the tab returns to
  // foreground. The server-side markRead in getMessages handles the initial
  // SSR; this listener covers the Nigerian mobile background-and-return
  // pattern where the user opens the thread, switches apps, then returns —
  // any messages that arrived via Realtime while backgrounded need to be
  // acknowledged so the sender's ✓ → ✓✓ advance fires.
  //
  // Two-event surface (§2.A): visibilitychange AND focus, gated by
  // document.visibilityState so focus events that arrive while still hidden
  // don't trigger a redundant call. Debounce: simple last-fire ref; only
  // dispatch if >2s since last fire (§2.B).
  useEffect(() => {
    let lastFireAt = 0;

    const handler = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastFireAt < 2_000) return;
      lastFireAt = now;
      // Best-effort; never throws on caller per action's contract.
      void markConversationAsRead(conversationId).catch((err) => {
        console.error("[MessageThread] markConversationAsRead failed", err);
      });
    };

    document.addEventListener("visibilitychange", handler);
    window.addEventListener("focus", handler);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("focus", handler);
    };
  }, [conversationId]);

  // Live messages from the shell. Falls back to initialMessages until SEED_ACTIVE
  // has committed (first render race — useEffect runs after paint).
  const messages: ThreadMessage[] =
    state.activeConversationId === conversationId && state.activeSeeded
      ? state.activeMessages
      : (initialMessages as ThreadMessage[]);

  const showLoadEarlier =
    state.activeConversationId === conversationId &&
    state.activeSeeded &&
    state.activeMessagesHasMore;

  // "Load earlier messages" handler with scroll-position preservation.
  // Pattern: snapshot the scrollable container's scrollHeight + scrollTop
  // BEFORE prepending. After React commits the prepend, the new scrollHeight
  // grows by exactly the prepended content's height. Adjust scrollTop by
  // that delta so the previously-visible content stays at the same viewport
  // position — no jarring jump to the top.
  const handleLoadEarlier = async () => {
    if (loadingEarlier || messages.length === 0) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const beforeHeight = scrollEl.scrollHeight;
    const beforeTop = scrollEl.scrollTop;

    setLoadingEarlier(true);
    try {
      const oldestId = messages[0]!.id;
      const prependedCount = await loadEarlierMessages(conversationId, oldestId);
      if (prependedCount > 0) {
        // Wait one frame for React to commit the prepended messages and the
        // browser to recompute scrollHeight, then restore relative position.
        requestAnimationFrame(() => {
          const after = scrollRef.current;
          if (!after) return;
          const newHeight = after.scrollHeight;
          after.scrollTop = newHeight - beforeHeight + beforeTop;
        });
      }
    } finally {
      setLoadingEarlier(false);
    }
  };

  if (messages.length === 0) {
    return (
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0 px-3 sm:px-6 py-12 text-center text-sm text-ink-600"
      >
        No messages yet.
        <ScrollToBottom />
      </div>
    );
  }

  // Build the render list — interleave date dividers between days, mark
  // bubbles grouped-with-previous when same sender within same day.
  const items: React.ReactNode[] = [];
  let prevDate: Date | null = null;
  let prevSender: string | null = null;

  for (const msg of messages) {
    const msgDate = new Date(msg.createdAt);
    const dayChanged = !prevDate || !isSameDay(prevDate, msgDate);

    if (dayChanged) {
      items.push(<DateDivider key={`d-${msg.id}`} iso={msg.createdAt} />);
    }

    const groupedWithPrevious =
      prevSender === msg.senderId &&
      !dayChanged &&
      msg.messageType !== "system";

    items.push(
      <MessageBubble
        key={msg.id}
        message={msg}
        isCurrentUser={msg.senderId === currentUserId}
        groupedWithPrevious={groupedWithPrevious}
        onDismissFailed={
          msg.failed ? () => dismissFailed(conversationId, msg.id) : undefined
        }
        onRetryFailed={
          msg.failed ? () => retryFailed(conversationId, msg.id) : undefined
        }
        listing={listing}
      />,
    );

    prevDate = msgDate;
    prevSender = msg.senderId;
  }

  const lastMsgId = messages[messages.length - 1]?.id ?? "empty";

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto min-h-0 px-3 sm:px-6 py-4"
    >
      {showLoadEarlier && (
        <div className="text-center py-2">
          <button
            type="button"
            onClick={handleLoadEarlier}
            disabled={loadingEarlier}
            className="text-sm text-teal-700 hover:text-teal-900 font-medium disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:underline"
          >
            {loadingEarlier ? "Loading…" : "Load earlier messages"}
          </button>
        </div>
      )}
      {items}
      <ScrollToBottom key={lastMsgId} />
    </div>
  );
}
