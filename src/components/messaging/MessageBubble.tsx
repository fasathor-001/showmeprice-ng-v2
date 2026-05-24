"use client";

import { useClientTime } from "@/lib/use-client-time";
import type { MessageRow } from "@/lib/messaging/types";
import type { ThreadMessage } from "@/lib/messaging/realtime";

// Stage 2.B Commit 3 — single message bubble. Pending / failed visual states
// added in Commit 5 for optimistic-UI feedback (surface findings E).
// Commit 5.5: "use client" + useClientTime for the timestamp — previous
// `t.getHours()/getMinutes()` on a Date during server render used UTC, then
// the client rendered local time, producing a text-content hydration
// mismatch on every bubble. The mismatch cascaded to React #423 (root
// fallback to client-only rendering), which silently broke optimistic UI
// dispatches and realtime subscription init. See useClientTime docstring.
//
// Visual states for current-user bubbles:
//   - normal: full opacity, no indicator
//   - pending (server insert in flight): opacity-60, small ⌚ next to timestamp
//   - failed (server returned error): danger border, "Tap to retry" link
//   - confirmed (server returned success): same as normal
//
// Other-party bubbles never carry pending/failed state — they only ever
// arrive via realtime, fully-formed from the database.
//
// `metadata.contains_warning` is NOT surfaced in the bubble (K-038 trust-
// positioning: filter signals are admin-only, not user-facing).
//
// Commit 6 — K-041 read receipts SHIPPED. Two-state model (sent ✓ / read ✓✓)
// with teal-700 for the read state. Symmetric data; both buyer + seller get
// receipts on their own sent messages. Recipient's view never shows receipts
// on the other party's incoming bubbles. Receipts hidden during pending +
// failed states (the clock icon / danger border own those signals).

interface MessageBubbleProps {
  message: MessageRow | ThreadMessage;
  isCurrentUser: boolean;
  groupedWithPrevious: boolean;
  /** When set, the bubble is in failed state and clicking the retry link calls this. */
  onDismissFailed?: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  image: "📷 Photo",
  voice_note: "🎤 Voice note",
  offer: "💼 Offer",
};

export function MessageBubble({
  message,
  isCurrentUser,
  groupedWithPrevious,
  onDismissFailed,
}: MessageBubbleProps) {
  // Client-only HH:mm in the user's local timezone (Commit 5.5 hydration fix).
  // Hooks must run unconditionally before any early return — system-message
  // branch below would otherwise skip this hook and violate rules-of-hooks
  // if a message ever transitions message_type.
  const timeText = useClientTime(message.createdAt, "hhmm");

  // System messages render centered, no bubble.
  if (message.messageType === "system") {
    return (
      <div className="text-center text-xs text-ink-400 my-3 px-4">
        {message.content ?? ""}
      </div>
    );
  }

  const typeLabel = TYPE_LABEL[message.messageType];
  const content = typeLabel ?? (message.content?.trim() || "");

  const threadMsg = message as Partial<ThreadMessage>;
  const isPending = Boolean(threadMsg.pending);
  const isFailed = Boolean(threadMsg.failed);
  const isRead = Boolean(message.readAt);
  // Show a read-receipt indicator only on the current user's OWN bubbles
  // (after server-confirmed; never during pending / failed states).
  const showReceipt = isCurrentUser && !isPending && !isFailed;

  const gapClass = groupedWithPrevious ? "mt-0.5" : "mt-3";
  const alignClass = isCurrentUser ? "justify-end" : "justify-start";
  const colAlignClass = isCurrentUser ? "items-end" : "items-start";

  // Bubble background:
  //   - failed: danger-bg + danger-text border (signals problem)
  //   - normal current-user: teal-50
  //   - normal other-party: neutral-100
  const bubbleClass = isFailed
    ? "bg-danger-bg text-ink border border-danger-text/40"
    : isCurrentUser
      ? "bg-teal-50 text-ink"
      : "bg-neutral-100 text-ink";

  // Pending bubbles fade slightly so users can distinguish optimistic
  // (still-sending) from confirmed messages without the bubble looking broken.
  const opacityClass = isPending ? "opacity-60" : "opacity-100";

  return (
    <div className={`flex ${alignClass} ${gapClass}`}>
      <div
        className={`flex flex-col max-w-[75%] sm:max-w-[60%] ${colAlignClass}`}
      >
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm break-words whitespace-pre-wrap transition-opacity duration-200 ${bubbleClass} ${opacityClass}`}
        >
          {content || (
            <span className="text-ink-400 italic">[empty]</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 px-1">
          <span className="text-xs text-ink-400">{timeText}</span>
          {isPending && (
            // Tiny clock indicator next to the timestamp — WhatsApp pattern.
            <svg
              viewBox="0 0 24 24"
              className="w-3 h-3 text-ink-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-label="Sending"
            >
              <circle cx="12" cy="12" r="9" />
              <path
                d="M12 7v5l3 2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {/* K-041 read receipts (Commit 6). Single ✓ ink-400 = sent,
              awaiting read. Double ✓✓ teal-700 = read. Only on own bubbles,
              never during pending / failed (those have their own signals). */}
          {showReceipt && !isRead && (
            <svg
              viewBox="0 0 16 12"
              className="w-3.5 h-2.5 text-ink-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-label="Sent"
            >
              <path d="M1 6.5 L5.5 11 L15 1" />
            </svg>
          )}
          {showReceipt && isRead && (
            <svg
              viewBox="0 0 22 12"
              className="w-5 h-2.5 text-teal-700"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-label="Read"
            >
              <path d="M1 6.5 L5.5 11 L13 2" />
              <path d="M9 6.5 L13 11 L21 1" />
            </svg>
          )}
        </div>
        {isFailed && onDismissFailed && (
          <button
            type="button"
            onClick={onDismissFailed}
            className="mt-1 text-xs text-danger-text hover:underline focus:outline-none focus-visible:underline"
          >
            Failed to send. Tap to dismiss.
          </button>
        )}
      </div>
    </div>
  );
}
