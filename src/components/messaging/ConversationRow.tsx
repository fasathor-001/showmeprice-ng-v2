"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui";
import { formatConversationTime, formatLastActive } from "@/lib/time";
import type { ConversationSummary } from "@/lib/messaging/types";

// Commit 2 — single row in the conversation list (client component as of
// Commit 5 to support active-state styling + realtime flash on new-message
// arrival).
//
// Layout (mobile-first, ~92px tall after Commit 4.2 typography bump):
//   ┌─────────┬───────────────────────────────────────┬──────────┐
//   │  thumb  │  display name + verified badge        │ HH:mm    │
//   │ 56×56   │  Buying/Selling   last-message-preview │  [3]     │
//   │         │  Active 5h ago    listing title · Sold │          │
//   └─────────┴───────────────────────────────────────┴──────────┘
//
// Active-state styling (Commit 5, surface findings H): when this row's
// conversation matches the URL [conversationId], the row gets bg-neutral-100
// persistently. Hover (bg-neutral-50) is CONDITIONAL — only applied on
// non-active rows so the active tint doesn't get overridden when hovered.
//
// Flash animation (Commit 5, surface findings C): when this conversation's
// lastMessageAt changes (new message arrived via realtime), the row briefly
// tints teal-50 then fades back. ~700ms total via transition-colors.

interface ConversationRowProps {
  conversation: ConversationSummary;
  /** True when the URL segment matches this row's id (desktop split-pane highlight). */
  isActive?: boolean;
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

export function ConversationRow({
  conversation,
  isActive = false,
  now,
}: ConversationRowProps) {
  const { id, role, otherParty, listing, lastMessage, unreadCount, lastMessageAt } =
    conversation;

  // Flash on new-message arrival — detect lastMessageAt changes and pulse the
  // background for ~700ms. Skipped on first mount (no flash on initial render).
  const [flashing, setFlashing] = useState(false);
  const prevLastMessageAtRef = useRef<string | null | undefined>(lastMessageAt);
  useEffect(() => {
    if (prevLastMessageAtRef.current === lastMessageAt) return;
    prevLastMessageAtRef.current = lastMessageAt;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 700);
    return () => clearTimeout(t);
  }, [lastMessageAt]);

  const hasUnread = unreadCount > 0;
  // D-109 asymmetric: seller's last-active is shown TO the buyer; the buyer's
  // last-active is hidden from the seller.
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

  // Background-color cascade:
  //   - Active row: always bg-neutral-100 (sticky, no hover override).
  //   - Flashing (just got a new message): bg-teal-50, fades out.
  //   - Non-active idle: hover:bg-neutral-50 conditional class.
  // Conditional hover keeps the active highlight stable when hovered (H ref).
  const bgClass = isActive
    ? "bg-neutral-100"
    : flashing
      ? "bg-teal-50"
      : "hover:bg-neutral-50";

  return (
    <Link
      href={`/messages/${id}`}
      className={`group flex items-start gap-3 px-3 py-3 sm:px-4 transition-colors duration-700 border-b border-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-inset ${bgClass} ${
        isNonActiveListing ? "opacity-75" : ""
      }`}
      aria-current={isActive ? "page" : undefined}
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
            className={`truncate text-base ${
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

        {/* Line 2: role label + preview */}
        <div className="flex items-center gap-2 min-w-0 mt-0.5">
          <span className="text-xs text-ink-400 shrink-0">
            {role === "buyer" ? "Buying" : "Selling"}
          </span>
          <span
            className={`truncate text-sm ${
              hasUnread ? "text-ink font-medium" : "text-ink-600"
            }`}
          >
            {previewText(lastMessage, currentUserIsSender)}
          </span>
        </div>

        {/* Line 3: optional last-active + listing title + status label */}
        <div className="flex items-center gap-2 min-w-0 mt-0.5 text-xs text-ink-400">
          {lastActive && <span className="shrink-0">{lastActive}</span>}
          {lastActive && <span aria-hidden>·</span>}
          {listing ? (
            <span className="truncate">
              {listing.title}
              {statusLabel && (
                <>
                  {" "}
                  <span className="text-ink-400">· {statusLabel}</span>
                </>
              )}
            </span>
          ) : (
            <span className="truncate italic">Listing removed</span>
          )}
        </div>
      </div>

      {/* Right column: time + unread pill.
          D-121 reaffirmation (Commit 5.1): unread badge is red, matching the
          header icon badge + UserMenu badge. Red = "you have unread" across
          the whole messaging surface — consistent semantics.
          Time color stays ink-400 always (the red badge + bold name + bold
          preview are sufficient unread signal; the previous teal-700 time
          tint competed visually with the red badge). */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-xs text-ink-400">
          {formatConversationTime(lastMessageAt, now)}
        </span>
        {hasUnread && (
          <span
            className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold leading-none"
            aria-label={`${unreadCount} unread`}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>
    </Link>
  );
}
