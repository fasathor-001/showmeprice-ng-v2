import Link from "next/link";
import { Badge } from "@/components/ui";

// Commit 3 — sticky header for /messages/[conversationId].
//
// Two stacked regions:
//   1. Back button + other-party display name + Phone verified badge.
//   2. Listing context strip: thumbnail + title + price + optional status badge.
//      Clickable to /listings/[id] when the listing still exists; non-clickable
//      div when the listing has been deleted (listing=null) — defensive UX.
//
// Sits BELOW the global Header (which is `sticky top-0` with z-40), so this
// uses `top-16` (matches Header h-16) + z-30. Defensive z-index ordering
// avoids the iOS Safari sticky-stacking quirk surfaced in Commit 3 findings.

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
    <div className="sticky top-16 z-30 bg-white border-b border-neutral-200">
      <div className="px-3 sm:px-6 py-2 flex items-center gap-3 min-w-0">
        <Link
          href="/messages"
          className="text-sm text-ink-600 hover:text-ink shrink-0"
        >
          ← Back
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-ink truncate">
            {otherName}
          </span>
          {isPhoneVerified && (
            <Badge variant="verified" className="shrink-0">
              Phone verified
            </Badge>
          )}
        </div>
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
