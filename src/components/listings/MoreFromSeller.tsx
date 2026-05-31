import Link from "next/link";
import { ListingCard } from "./ListingCard";
import { getProductImagePublicUrl } from "@/lib/storage";

// Feature F — "More from this seller" rail rendered at the bottom of
// the listing detail page. Promotes cross-listing discovery for sellers
// with multiple active listings and drives engagement into the seller's
// full shop page at /sellers/[slug].
//
// Intentionally render-only: no DB access, no auth checks, no state.
// The parent (src/app/listings/[id]/page.tsx) fetches the rows in a
// top-level Promise.all alongside the auth call so this rail adds zero
// serial round-trips. Visibility gates (verified + !is_disabled) live
// on the parent page — by the time this renders, the seller is known
// good per the D-146 contract.
//
// Empty-state contract: when the seller has no other active listings,
// the component returns null so the page renders without an empty
// header or "nothing else listed" placeholder. Single-listing sellers
// are common at current supply; the rail just disappears.

interface MoreFromSellerProps {
  businessName: string;
  businessSlug: string;
  listings: Array<{
    id: string;
    title: string;
    price_kobo: number;
    is_negotiable: boolean;
    quantity: number;
    product_images: { storage_path: string; position: number }[];
    nigerian_states:
      | { name: string }
      | { name: string }[]
      | null;
    categories:
      | { supports_inventory: boolean }
      | { supports_inventory: boolean }[]
      | null;
  }>;
}

export function MoreFromSeller({
  businessName,
  businessSlug,
  listings,
}: MoreFromSellerProps) {
  if (listings.length === 0) return null;

  return (
    <div className="mt-12">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg sm:text-xl font-medium text-ink">
          More from {businessName}
        </h2>
        {/* Feature O: copy unified to "Visit seller shop →" across
            both the listing-detail seller-card CTA and this rail link,
            because the destination /sellers/[slug] now has both an
            About card and the listings grid — "view all listings" is
            too narrow a description. Color matches the existing
            seller-card link styling: text-teal-700 hover:text-teal-900. */}
        <Link
          href={`/sellers/${businessSlug}`}
          className="text-sm text-teal-700 hover:text-teal-900"
        >
          Visit seller shop →
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {listings.map((listing) => {
          const images = listing.product_images ?? [];
          const primary = [...images].sort(
            (a, b) => a.position - b.position,
          )[0];
          const state = Array.isArray(listing.nigerian_states)
            ? listing.nigerian_states[0]
            : listing.nigerian_states;
          // E.2.17.0 / Step 2 parity with the marketplace, homepage,
          // category, and shop surfaces (commit 6a2611e + Feature E).
          // Same shape: category embed lookup + quantity===0 check;
          // non-inventory categories never surface the overlay.
          const cat = Array.isArray(listing.categories)
            ? listing.categories[0]
            : listing.categories;
          const outOfStock =
            cat?.supports_inventory === true &&
            Number(listing.quantity ?? 1) === 0;
          return (
            <ListingCard
              key={listing.id}
              id={listing.id}
              title={listing.title}
              priceKobo={listing.price_kobo}
              isNegotiable={listing.is_negotiable}
              primaryImageUrl={
                primary
                  ? getProductImagePublicUrl(primary.storage_path)
                  : undefined
              }
              stateName={state?.name}
              outOfStock={outOfStock}
            />
          );
        })}
      </div>
    </div>
  );
}
