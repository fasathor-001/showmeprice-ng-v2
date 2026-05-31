import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { ListingCard } from "@/components/listings/ListingCard";
import { getProductImagePublicUrl } from "@/lib/storage";
import { roundRobinBySeller } from "@/lib/listings";

const FEATURED_COUNT = 24;

// Over-fetch multiplier — pull more recent listings than we render so the
// round-robin below has material to diversify across sellers. 4× covers
// the case where a single prolific seller would otherwise dominate the
// top of the recency stream (during the initial round-robin landing in
// D-144, one fashion seller held 8 of 9 verified listings; at limit=8
// the homepage was effectively a single-seller catalogue). With
// FEATURED_COUNT bumped to 24, the displayed grid is 6 rows × 4 columns
// on desktop and the over-fetch becomes 96 — still trivial latency cost
// at any plausible scale through Phase F. When supply grows past low
// thousands, this pattern can move to a server-side RPC using
// ROW_NUMBER OVER PARTITION BY seller_id — not the right time today.
const OVER_FETCH = FEATURED_COUNT * 4;

// `roundRobinBySeller` originally lived inline in this file (D-144 /
// commit 207da1d). Extracted to @/lib/listings/round-robin.ts when the
// category browse page needed the same shape. Canonical location is
// the lib module; this file just imports + calls.

export async function FeaturedListings() {
  const supabase = createClient();

  // Visibility gate (Phase C.5.4 + RLS policy P.2): only verified-seller
  // listings. seller_id + created_at are needed for the round-robin
  // helper below. quantity + categories(supports_inventory) drive the
  // out-of-stock overlay so the homepage card stays consistent with the
  // marketplace card (parity with commit 6a2611e). Over-fetch via
  // OVER_FETCH so the round-robin has material to diversify across
  // sellers; the displayed count stays FEATURED_COUNT.
  const { data: listings } = await supabase
    .from("products")
    .select(
      `
      id, title, price_kobo, is_negotiable, seller_id, created_at, quantity, city_area,
      product_images ( storage_path, position ),
      businesses!inner ( business_name, verification_status ),
      nigerian_states ( name ),
      categories ( supports_inventory )
    `
    )
    .eq("status", "active")
    .eq("businesses.verification_status", "verified")
    // D-146: disabled-seller listings stay invisible on public browse.
    // Filtering pre-round-robin keeps the OVER_FETCH=32 pool clean — a
    // disabled seller can never enter the round-robin's input.
    .eq("businesses.is_disabled", false)
    .order("created_at", { ascending: false })
    .limit(OVER_FETCH);

  const items = roundRobinBySeller(listings ?? [], FEATURED_COUNT);

  if (items.length === 0) {
    return (
      <section className="py-12 sm:py-16 bg-neutral-50">
        <Container>
          <div className="text-center max-w-lg mx-auto py-6">
            <h2 className="text-lg sm:text-xl font-medium text-ink mb-2">
              Be the first to list
            </h2>
            <p className="text-sm text-ink-600 mb-6">
              ShowMePrice is just getting started. Real sellers, real prices — and we
              want yours to be among the first.
            </p>
            <Link
              href="/sell"
              className="inline-flex items-center justify-center bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm px-5 py-2.5 rounded-lg transition-colors"
            >
              Sell on ShowMePrice
            </Link>
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section className="py-12 sm:py-16 bg-neutral-50">
      <Container>
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-lg sm:text-xl font-medium text-ink">Recent listings</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {items.map((listing) => {
            const images = listing.product_images ?? [];
            const primary = [...images].sort(
              (a, b) => a.position - b.position
            )[0];
            const state = Array.isArray(listing.nigerian_states)
              ? listing.nigerian_states[0]
              : listing.nigerian_states;
            // E.2.17.0 / Step 2 parity with the marketplace card
            // (commit 6a2611e). Same shape: category embed lookup +
            // quantity===0 check; non-inventory categories never
            // surface the overlay.
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
                cityArea={listing.city_area}
                stateName={state?.name}
                outOfStock={outOfStock}
              />
            );
          })}
        </div>
        {/* Centered CTA below the grid — sends buyers into the full
            marketplace once they've scanned the 24-card recent grid.
            Renders only in this populated branch; the empty-state branch
            already has its own "Sell on ShowMePrice" CTA, no need to
            point buyers at an empty marketplace from an empty homepage. */}
        <div className="mt-8 sm:mt-10 flex justify-center">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 text-teal-700 hover:text-teal-900 font-medium text-sm sm:text-base"
          >
            View all listings →
          </Link>
        </div>
      </Container>
    </section>
  );
}
