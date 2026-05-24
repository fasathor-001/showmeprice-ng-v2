"use client";

import { useClientTime } from "@/lib/use-client-time";
import type { MessageRow } from "@/lib/messaging/types";
import type { ThreadMessage } from "@/lib/messaging/realtime";
import { ImageBubble } from "./ImageBubble";

// Stage 2.B Commit 3 — single message bubble. Pending / failed visual states
// added in Commit 5 for optimistic-UI feedback (surface findings E).
// Commit 5.5: "use client" + useClientTime for the timestamp.
//
// Visual states for current-user bubbles:
//   - normal: full opacity, no indicator
//   - pending (server insert in flight): opacity-60, small ⌚ next to timestamp
//   - failed (server returned error): danger border + ↻ Retry · Dismiss
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
// receipts on their own sent messages. Receipts hidden during pending +
// failed states (the clock icon / danger border own those signals).
//
// Commit 8 (Stage 2.C) — TC-002 + TC-019 — failed-state bubble now offers
// BOTH Retry (↻) and Dismiss. Retry re-uses the same tempId so the bubble
// stays in place; ~3 attempts per bubble (`retryCount` on ThreadMessage).
// After the 3rd failure, Retry disables and the bubble copy escalates to
// "Couldn't send after 3 attempts." Dismiss stays available throughout.
// Retry budget resets on page refresh (acceptable MVP behavior).

const RETRY_BUDGET = 3;

interface MessageBubbleProps {
  message: MessageRow | ThreadMessage;
  isCurrentUser: boolean;
  groupedWithPrevious: boolean;
  /** When set, the bubble is failed and clicking Dismiss calls this. */
  onDismissFailed?: () => void;
  /**
   * When set, the bubble is failed and the user has retry budget remaining.
   * Calling this triggers RETRY_FAILED → re-dispatch sendMessage. Omit when
   * the budget is exhausted to render the Retry link as visually disabled.
   */
  onRetryFailed?: () => void;
  /**
   * Commit 9-b — listing context passed through to ImageBubble's viewer
   * top-bar chip. Optional; absent for text-type messages.
   */
  listing?: {
    id: string;
    title: string;
    primaryImageUrl: string | null;
  } | null;
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
  onRetryFailed,
  listing,
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

  // Commit 9-b — image-type messages delegate to ImageBubble. The image
  // lifecycle (placeholder / sent / failed phases + multi-image layouts +
  // viewer integration) is too distinct from text-message rendering to
  // share a body; the timestamp + receipts pattern is mirrored inside
  // ImageBubble. TYPE_LABEL fallback path below stays as ultimate
  // safety net but ImageBubble itself has a worst-case "📷 Photo"
  // placeholder so it never falls through here.
  if (message.messageType === "image") {
    return (
      <ImageBubble
        message={message as ThreadMessage}
        isCurrentUser={isCurrentUser}
        listing={listing}
      />
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
        {isFailed && (onDismissFailed || onRetryFailed) && (
          <div className="mt-1 flex items-center gap-2 text-xs">
            {(threadMsg.retryCount ?? 0) >= RETRY_BUDGET ? (
              // Budget exhausted — bubble-level copy escalates; Retry hidden.
              <span className="text-danger-text">
                Couldn&apos;t send after {RETRY_BUDGET} attempts.
              </span>
            ) : (
              <>
                {onRetryFailed && (
                  <button
                    type="button"
                    onClick={onRetryFailed}
                    className="inline-flex items-center gap-1 text-danger-text hover:underline focus:outline-none focus-visible:underline"
                    aria-label="Retry sending this message"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 12a9 9 0 1 1-3.18-6.87" />
                      <path d="M21 4v5h-5" />
                    </svg>
                    Retry
                  </button>
                )}
                {onRetryFailed && onDismissFailed && (
                  <span className="text-ink-400" aria-hidden="true">
                    ·
                  </span>
                )}
              </>
            )}
            {onDismissFailed && (
              <button
                type="button"
                onClick={onDismissFailed}
                className="text-ink-500 hover:text-ink hover:underline focus:outline-none focus-visible:underline"
                aria-label="Dismiss failed message"
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
