import Link from "next/link";
import { Card } from "@/components/ui";
import { formatNaira } from "@/lib/listings";

interface ListingCardProps {
  id: string;
  title: string;
  priceKobo: number | bigint;
  isNegotiable: boolean;
  primaryImageUrl?: string | null;
  stateName?: string;
}

/**
 * Compact marketplace listing card. Phase D.6 density:
 *   - 2 / 3 / 4 cards per row (mobile / tablet / desktop)
 *   - price leads visually; title supports; state chip anchors
 *   - no seller name (visible on detail), no per-card verified badge
 *     (marketplace queries already filter to verified-only sellers)
 */
export function ListingCard({
  id,
  title,
  priceKobo,
  isNegotiable,
  primaryImageUrl,
  stateName,
}: ListingCardProps) {
  return (
    <Link href={`/listings/${id}`} className="block">
      <Card variant="hover" padding="none" className="overflow-hidden h-full">
        <div className="aspect-square bg-neutral-100 flex items-center justify-center text-neutral-300">
          {primaryImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={primaryImageUrl}
              alt={title}
              className="w-full h-full object-cover"
            />
          ) : (
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
          )}
        </div>
        <div className="p-2.5 sm:p-3">
          <p className="text-base sm:text-lg font-medium text-ink tabular-nums leading-tight">
            {formatNaira(priceKobo)}
            {isNegotiable && (
              <span className="text-xs text-ink-600 font-normal ml-1">
                neg.
              </span>
            )}
          </p>
          <h3 className="text-sm text-ink-600 leading-snug line-clamp-2 mt-1 mb-2">
            {title}
          </h3>
          {stateName && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-600">
              <MapPinIcon />
              {stateName}
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}

function MapPinIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
