import Link from "next/link";
import { Badge } from "@/components/ui";
import { formatConversationTime, formatLastActive } from "@/lib/time";
import type { ConversationSummary } from "@/lib/messaging/types";

// Commit 2 — single row in the conversation list. Server Component (no
// client state at this commit; realtime layered in Commit 5).
//
// Layout (mobile-first):
//   ┌─────────┬───────────────────────────────────────┬──────────┐
//   │  thumb  │  display name + verified badge        │ HH:mm    │
//   │ 56×56   │  Buying/Selling   last-message-preview │  [3]     │
//   │         │  Active 5h ago    listing title • ₦   │          │
//   └─────────┴───────────────────────────────────────┴──────────┘
//
// Non-active status (sold / deleted / archived) shows a small ghost label
// next to the listing title.

interface ConversationRowProps {
  conversation: ConversationSummary;
  /** Frozen `now` for deterministic SSR — uses Date.now() if omitted. */
  now?: Date;
}

const STATUS_LABEL: Record<string, string> = {
  active: "",
  archived: "Archived",
  listing_sold: "Sold",
  listing_deleted: "Listing removed",
};

const MESSAGE_TYPE_PREVIEW: Record<string, string> = {
  image: "📷 Photo",
  voice_note: "🎤 Voice note",
  offer: "💼 Offer",
};

function previewText(
  last: ConversationSummary["lastMessage"],
  currentUserIsSender: boolean,
): string {
  if (!last) return "—";
  const typeLabel = MESSAGE_TYPE_PREVIEW[last.messageType];
  if (typeLabel) {
    return currentUserIsSender ? `You: ${typeLabel}` : typeLabel;
  }
  const content = (last.content ?? "").trim();
  if (!content) return "—";
  const truncated = content.length > 80 ? content.slice(0, 80) + "…" : content;
  return currentUserIsSender ? `You: ${truncated}` : truncated;
}

function ListingPlaceholder() {
  // Inline SVG — preserves visual rhythm when listing is deleted or has no
  // image (B1). Muted neutral palette so it never reads as a real product.
  return (
    <div
      className="flex items-center justify-center w-14 h-14 rounded-lg bg-neutral-100 shrink-0"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="w-6 h-6 text-neutral-400"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="11" r="1.5" />
        <path d="M5 17l4-4 3 3 5-5 2 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function ConversationRow({ conversation, now }: ConversationRowProps) {
  const { id, role, otherParty, listing, lastMessage, unreadCount, lastMessageAt } =
    conversation;

  const hasUnread = unreadCount > 0;
  // D-109 asymmetric last-active: shown only when current user is the BUYER
  // (seller's last-active visible to buyer). Hidden when current user is the
  // seller (buyer's last-active not shown to seller).
  const showLastActive = role === "buyer" && Boolean(otherParty.lastSeenAt);
  const lastActive = showLastActive
    ? formatLastActive(otherParty.lastSeenAt, now)
    : "";

  const isPhoneVerified =
    Array.isArray(otherParty.verificationStatus) &&
    otherParty.verificationStatus.includes("phone_verified");

  const statusLabel = listing ? STATUS_LABEL[listing.status] ?? "" : "";
  const isNonActiveListing = Boolean(statusLabel);
  const currentUserIsSender = lastMessage
    ? lastMessage.senderId !== otherParty.id
    : false;

  return (
    <Link
      href={`/messages/${id}`}
      className={`group flex items-start gap-3 px-3 py-3 sm:px-4 hover:bg-neutral-50 transition-colors border-b border-neutral-100 ${
        isNonActiveListing ? "opacity-75" : ""
      }`}
    >
      {/* Thumbnail */}
      {listing?.primaryImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={listing.primaryImageUrl}
          alt=""
          className="w-14 h-14 rounded-lg object-cover bg-neutral-100 shrink-0"
          loading="lazy"
        />
      ) : (
        <ListingPlaceholder />
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0">
        {/* Line 1: display name + verified badge */}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`truncate text-sm ${
              hasUnread ? "font-semibold text-ink" : "font-medium text-ink"
            }`}
          >
            {otherParty.displayName}
          </span>
          {isPhoneVerified && (
            <Badge variant="verified" className="shrink-0">
              Phone verified
            </Badge>
          )}
        </div>

        {/* Line 2: role label (muted) + preview */}
        <div className="flex items-center gap-2 min-w-0 mt-0.5">
          <span className="text-xs text-ink-400 shrink-0">
            {role === "buyer" ? "Buying" : "Selling"}
          </span>
          <span
            className={`truncate text-xs ${
              hasUnread ? "text-ink font-medium" : "text-ink-600"
            }`}
          >
            {previewText(lastMessage, currentUserIsSender)}
          </span>
        </div>

        {/* Line 3: optional last-active + listing title + status label */}
        <div className="flex items-center gap-2 min-w-0 mt-0.5 text-xs text-ink-400">
          {lastActive && <span className="shrink-0">{lastActive}</span>}
          {lastActive && listing && <span aria-hidden>·</span>}
          {listing && (
            <span className="truncate">
              {listing.title}
              {statusLabel && (
                <>
                  {" "}
                  <span className="text-ink-400">· {statusLabel}</span>
                </>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Right column: time + unread pill */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={`text-xs ${hasUnread ? "text-teal-700 font-medium" : "text-ink-400"}`}>
          {formatConversationTime(lastMessageAt, now)}
        </span>
        {hasUnread && (
          <span
            className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-teal-600 text-white text-[11px] font-medium leading-none"
            aria-label={`${unreadCount} unread`}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>
    </Link>
  );
}
