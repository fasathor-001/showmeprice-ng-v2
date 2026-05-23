import type { MessageRow } from "@/lib/messaging/types";

// Commit 3 — single message bubble. Server Component (no client state).
//
// Layout:
//   Current user's messages → right-aligned, teal-50 bubble.
//   Other party's messages  → left-aligned, neutral-100 bubble.
//   Bubble max-width: 75% mobile / 60% desktop.
//   Timestamp: HH:mm under the bubble, ink-400.
//
// Sender grouping: when `groupedWithPrevious=true` (consecutive messages from
// the same sender within the same day), reduce the gap above this bubble so
// the group reads as a single block.
//
// Non-text message types render an emoji placeholder per Commit 3 approval —
// real image / voice / offer rendering ships Commit 6+.
//
// `metadata.contains_warning` is NOT surfaced in the bubble (K-038 trust-
// positioning: filter signals are admin-only, not user-facing).
//
// Read receipts (K-041) deferred to Commit 6 polish.

interface MessageBubbleProps {
  message: MessageRow;
  isCurrentUser: boolean;
  groupedWithPrevious: boolean;
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
}: MessageBubbleProps) {
  // System messages render centered, no bubble — typically auto-generated
  // status text. Keep them visually distinct so they don't get confused with
  // user-authored content.
  if (message.messageType === "system") {
    return (
      <div className="text-center text-xs text-ink-400 my-3 px-4">
        {message.content ?? ""}
      </div>
    );
  }

  const typeLabel = TYPE_LABEL[message.messageType];
  const content =
    typeLabel ?? (message.content?.trim() || "");

  const t = new Date(message.createdAt);
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  const timeText = `${hh}:${mm}`;

  const gapClass = groupedWithPrevious ? "mt-0.5" : "mt-3";
  const alignClass = isCurrentUser ? "justify-end" : "justify-start";
  const colAlignClass = isCurrentUser ? "items-end" : "items-start";
  const bubbleClass = isCurrentUser
    ? "bg-teal-50 text-ink"
    : "bg-neutral-100 text-ink";

  return (
    <div className={`flex ${alignClass} ${gapClass}`}>
      <div
        className={`flex flex-col max-w-[75%] sm:max-w-[60%] ${colAlignClass}`}
      >
        <div
          /* D-121 (Commit 4.2): bubble padding px-3.5 py-2 → px-4 py-2.5
             — aligns with WhatsApp Web / iMessage breathing-room standard. */
          className={`rounded-2xl px-4 py-2.5 text-sm break-words whitespace-pre-wrap ${bubbleClass}`}
        >
          {content || (
            <span className="text-ink-400 italic">[empty]</span>
          )}
        </div>
        <span className="text-xs text-ink-400 mt-0.5 px-1">{timeText}</span>
      </div>
    </div>
  );
}
