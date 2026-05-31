import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { formatNaira } from "@/lib/listings";
import { formatLocation } from "@/lib/location/format";
import { ProductImage } from "./ProductImage";

interface ListingCardProps {
  id: string;
  title: string;
  priceKobo: number | bigint;
  isNegotiable: boolean;
  primaryImageUrl?: string | null;
  // Feature P: products.city_area for "City, State" rendering via
  // formatLocation. Optional — when undefined/null, the card falls
  // back to state-alone (or no location chip at all if state is also
  // missing). This is the LISTING's location, not the seller's.
  cityArea?: string | null;
  stateName?: string;
  // E.2.17.0 / Step 2: when true, render an "Out of stock" overlay on
  // the image (top-left, mirroring the dashboard's "Sold" overlay
  // pattern). Caller computes this from the listing's category
  // supports_inventory + the listing's quantity.
  outOfStock?: boolean;
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
  cityArea,
  stateName,
  outOfStock = false,
}: ListingCardProps) {
  const location = formatLocation(cityArea, stateName);
  return (
    <Link href={`/listings/${id}`} className="block">
      <Card variant="hover" padding="none" className="overflow-hidden h-full">
        <div className="aspect-square bg-neutral-100 flex items-center justify-center text-neutral-300 relative">
          {outOfStock && (
            <span className="absolute top-2 left-2 z-10">
              <Badge variant="warning">Out of stock</Badge>
            </span>
          )}
          {primaryImageUrl ? (
            <ProductImage
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
          {location && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-600">
              <MapPinIcon />
              {location}
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
