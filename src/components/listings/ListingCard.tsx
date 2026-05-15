import Link from "next/link";
import { Card } from "@/components/ui";
import { formatNaira, truncate } from "@/lib/listings";

interface ListingCardProps {
  id: string;
  title: string;
  priceKobo: number | bigint;
  isNegotiable: boolean;
  primaryImageUrl?: string | null;
  sellerName?: string;
  isVerified: boolean;
  stateName?: string;
}

export function ListingCard({
  id,
  title,
  priceKobo,
  isNegotiable,
  primaryImageUrl,
  sellerName,
  isVerified,
  stateName,
}: ListingCardProps) {
  return (
    <Link href={`/listings/${id}`}>
      <Card variant="hover" padding="none" className="overflow-hidden h-full">
        <div className="aspect-square bg-neutral-100 flex items-center justify-center text-neutral-300 relative">
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
        <div className="p-3">
          <h3 className="text-sm font-medium text-ink leading-snug mb-1 line-clamp-2">
            {truncate(title, 80)}
          </h3>
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="text-base font-medium text-ink tabular-nums">
              {formatNaira(priceKobo)}
            </span>
            {isNegotiable && (
              <span className="text-xs text-ink-600">negotiable</span>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-ink-600 gap-2">
            <div className="flex items-center gap-1 min-w-0">
              {isVerified && (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#0F9D58"
                  strokeWidth="2.5"
                  className="shrink-0"
                  aria-hidden="true"
                >
                  <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              )}
              {sellerName && <span className="truncate">{sellerName}</span>}
            </div>
            {stateName && <span className="shrink-0">{stateName}</span>}
          </div>
        </div>
      </Card>
    </Link>
  );
}
