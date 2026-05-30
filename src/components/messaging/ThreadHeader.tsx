import Link from "next/link";
import { Badge } from "@/components/ui";
import { ReportUserButton } from "@/components/users/ReportUserButton";

// Commit 3 — header for /messages/[conversationId]. Commit 4.1 dropped the
// `sticky top-16 z-30` here because the route's container is now `position:
// fixed` (page.tsx) — ThreadHeader sits at the top of a flex column that
// doesn't scroll, so sticky becomes a no-op. Keeping it would be confusing.
//
// Two stacked regions:
//   1. Back button + other-party display name + Phone verified badge.
//   2. Listing context strip: thumbnail + title + price + optional status badge.
//      Clickable to /listings/[id] when the listing still exists; non-clickable
//      div when the listing has been deleted (listing=null) — defensive UX.

interface ThreadHeaderProps {
  otherParty: {
    id: string;
    display_name: string | null;
    verification_status: string[] | null;
  };
  listing: {
    id: string;
    title: string | null;
    price_kobo: number | null;
    status: string;
  } | null;
  primaryImageUrl: string | null;
  /** conversation.status — drives the status badge ("Sold" / "Archived" etc.) */
  conversationStatus: string;
}

// Feature K: ThreadHeader receives both participants resolved server-
// side, so the conversation page can always render the report button
// because the other party is, by definition, never the current user
// (otherwise the conversation would not exist with this otherParty).
// The not-self gate is therefore implicit at this surface. The server
// action still enforces it as defense in depth.

const STATUS_LABEL: Record<string, string> = {
  active: "",
  archived: "Archived",
  listing_sold: "Sold",
  listing_deleted: "Listing removed",
};

function formatNaira(kobo: number | null | undefined): string {
  if (kobo === null || kobo === undefined) return "";
  const naira = Math.floor(kobo / 100);
  return `₦${naira.toLocaleString("en-NG")}`;
}

function ListingPlaceholder() {
  return (
    <div
      className="flex items-center justify-center w-12 h-12 rounded-lg bg-neutral-100 shrink-0"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="w-5 h-5 text-neutral-400"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="11" r="1.5" />
        <path
          d="M5 17l4-4 3 3 5-5 2 2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function ThreadHeader({
  otherParty,
  listing,
  primaryImageUrl,
  conversationStatus,
}: ThreadHeaderProps) {
  const otherName = otherParty.display_name ?? "—";
  const isPhoneVerified = (otherParty.verification_status ?? []).includes(
    "phone_verified",
  );
  const statusLabel = STATUS_LABEL[conversationStatus] ?? "";

  const listingStrip = (
    <div className="flex items-center gap-3 min-w-0">
      {primaryImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={primaryImageUrl}
          alt=""
          className="w-12 h-12 rounded-lg object-cover bg-neutral-100 shrink-0"
          loading="lazy"
        />
      ) : (
        <ListingPlaceholder />
      )}
      <div className="flex-1 min-w-0 text-left">
        <div className="text-sm text-ink truncate">
          {listing?.title ?? "Listing removed"}
        </div>
        {listing?.price_kobo != null && (
          <div className="text-xs text-ink-600">
            {formatNaira(listing.price_kobo)}
          </div>
        )}
      </div>
      {statusLabel && (
        <Badge variant="neutral" className="shrink-0">
          {statusLabel}
        </Badge>
      )}
    </div>
  );

  return (
    <div className="bg-white border-b border-neutral-200 shrink-0">
      <div className="px-2 sm:px-4 py-1 flex items-center gap-2 min-w-0">
        {/* D-121 (Commit 4.2): chevron-left icon button with a 44×44 tap
            target. Replaces the previous "← Back" text link, which was
            ~24px tall (below WCAG mobile minimum). Negative margin keeps
            the icon visually inset while the hit area extends beyond.
            Commit 5: `lg:hidden` — on desktop split-pane the sidebar is
            already visible, so the back chevron is redundant chrome. */}
        <Link
          href="/messages"
          aria-label="Back to conversations"
          className="inline-flex lg:hidden items-center justify-center w-11 h-11 -ml-1 sm:-ml-2 rounded-lg text-ink-600 hover:bg-neutral-100 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 shrink-0 transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              d="M15 18l-6-6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-base font-medium text-ink truncate">
            {otherName}
          </span>
          {isPhoneVerified && (
            <Badge variant="verified" className="shrink-0">
              Phone verified
            </Badge>
          )}
        </div>
        {/* Feature K — one-per-other-party report affordance at
            conversation header level (not per-message). No router
            redirect on success: the modal closes and router.refresh
            keeps the buyer on the same thread. */}
        <ReportUserButton
          targetUserId={otherParty.id}
          targetDisplayName={otherName}
        />
      </div>
      <div className="px-3 sm:px-6 py-2 border-t border-neutral-100">
        {listing ? (
          <Link
            href={`/listings/${listing.id}`}
            className="block hover:bg-neutral-50 -mx-1 px-1 py-0.5 rounded transition-colors"
          >
            {listingStrip}
          </Link>
        ) : (
          <div>{listingStrip}</div>
        )}
      </div>
    </div>
  );
}
