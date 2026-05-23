import { formatThreadDateDivider } from "@/lib/time";
import type { MessageRow } from "@/lib/messaging/types";
import { MessageBubble } from "./MessageBubble";
import { ScrollToBottom } from "./ScrollToBottom";

// Commit 3 — wraps the message list with date dividers, sender grouping,
// and the scroll-to-bottom marker. Server Component (date-divider rendering
// and grouping are pure functions of the message array).
//
// Messages arrive from getMessages already in chronological order (oldest
// first). When two adjacent messages have:
//   - different calendar days → insert a date divider between them.
//   - same sender within the same day → render grouped (smaller gap).
//
// `hasMore` from getMessages indicates older messages exist — pagination
// ("Load older") is deferred to Commit 6 polish, so we surface a placeholder
// line at the top so smoke testing doesn't silently lose data.

interface MessageThreadProps {
  messages: MessageRow[];
  hasMore: boolean;
  currentUserId: string;
  /** Frozen `now` for deterministic SSR; defaults to current time. */
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
  messages,
  hasMore,
  currentUserId,
  now = new Date(),
}: MessageThreadProps) {
  if (messages.length === 0) {
    return (
      <div className="px-3 sm:px-6 py-12 text-center text-sm text-ink-600">
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
      items.push(
        <DateDivider key={`d-${msg.id}`} date={msgDate} now={now} />,
      );
    }

    const groupedWithPrevious =
      prevSender === msg.senderId &&
      !dayChanged &&
      // System messages never group with surrounding user messages.
      msg.messageType !== "system";

    items.push(
      <MessageBubble
        key={msg.id}
        message={msg}
        isCurrentUser={msg.senderId === currentUserId}
        groupedWithPrevious={groupedWithPrevious}
      />,
    );

    prevDate = msgDate;
    prevSender = msg.senderId;
  }

  return (
    <div className="px-3 sm:px-6 py-4">
      {hasMore && (
        <div className="text-center text-xs text-ink-400 py-2 italic">
          Earlier messages not shown — coming soon
        </div>
      )}
      {items}
      <ScrollToBottom />
    </div>
  );
}
