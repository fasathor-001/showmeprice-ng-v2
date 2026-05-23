"use client";

import { useEffect } from "react";
import { formatThreadDateDivider } from "@/lib/time";
import type { MessageRow } from "@/lib/messaging/types";
import type { ThreadMessage } from "@/lib/messaging/realtime";
import { useMessagesShell } from "./MessagesShell";
import { MessageBubble } from "./MessageBubble";
import { ScrollToBottom } from "./ScrollToBottom";

// Stage 2.B Commit 5 — message thread (client component as of this commit).
//
// Hydration pattern: the page (Server Component) calls getMessages() server-
// side and passes the result as `initialMessages`. On mount we SEED these
// into the shell's reducer state, then read live state back from the shell.
// All subsequent updates — realtime INSERTs, optimistic sends, server
// confirmations, send failures — flow through the shell's reducer and
// reactively re-render this thread.
//
// hasMore stays in the public API; "Load older" UI still deferred to Commit 6
// polish per Commit 4.2's earlier surface findings.

interface MessageThreadProps {
  conversationId: string;
  initialMessages: MessageRow[];
  hasMore: boolean;
  currentUserId: string;
  /** Frozen `now` for deterministic SSR — uses Date.now() if omitted. */
  now?: Date;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function DateDivider({ date, now }: { date: Date; now: Date }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-neutral-200" />
      <span className="text-xs text-ink-400 whitespace-nowrap">
        {formatThreadDateDivider(date.toISOString(), now)}
      </span>
      <div className="flex-1 h-px bg-neutral-200" />
    </div>
  );
}

export function MessageThread({
  conversationId,
  initialMessages,
  hasMore,
  currentUserId,
  now = new Date(),
}: MessageThreadProps) {
  const { state, seedActive, dismissFailed } = useMessagesShell();

  // Seed shell state with the server-rendered initial messages on first mount
  // (or when the conversation changes). The reducer's SEED_ACTIVE is idempotent
  // — subsequent re-renders with the same conversationId no-op.
  useEffect(() => {
    seedActive(conversationId, initialMessages as ThreadMessage[]);
  }, [conversationId, initialMessages, seedActive]);

  // Live messages from the shell. Falls back to initialMessages until SEED_ACTIVE
  // has committed (first render race — useEffect runs after paint).
  const messages: ThreadMessage[] =
    state.activeConversationId === conversationId && state.activeSeeded
      ? state.activeMessages
      : (initialMessages as ThreadMessage[]);

  // hasMore param retained in the public API; Commit 6 polish wires
  // "Load older" UI. Reference here to silence unused-param lint.
  void hasMore;

  if (messages.length === 0) {
    return (
      <div className="px-3 sm:px-6 py-12 text-center text-sm text-ink-600">
        No messages yet.
        <ScrollToBottom />
      </div>
    );
  }

  const items: React.ReactNode[] = [];
  let prevDate: Date | null = null;
  let prevSender: string | null = null;

  for (const msg of messages) {
    const msgDate = new Date(msg.createdAt);
    const dayChanged = !prevDate || !isSameDay(prevDate, msgDate);

    if (dayChanged) {
      items.push(
        <DateDivider key={`d-${msg.id}`} date={msgDate} now={now} />,
      );
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
          msg.failed
            ? () => dismissFailed(conversationId, msg.id)
            : undefined
        }
      />,
    );

    prevDate = msgDate;
    prevSender = msg.senderId;
  }

  // ScrollToBottom keyed on the last message's id so it re-fires whenever a
  // new message (optimistic, realtime, or server-confirmed) lands at the end.
  const lastMsgId = messages[messages.length - 1]?.id ?? "empty";

  return (
    <div className="px-3 sm:px-6 py-4">
      {items}
      <ScrollToBottom key={lastMsgId} />
    </div>
  );
}
