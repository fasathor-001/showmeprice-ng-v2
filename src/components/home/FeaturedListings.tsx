import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { ListingCard } from "@/components/listings/ListingCard";

const FEATURED_COUNT = 6;

export async function FeaturedListings() {
  const supabase = createClient();

  const { data: listings } = await supabase
    .from("products")
    .select(
      `
      id, title, price_kobo, is_negotiable,
      product_images ( url, is_primary, sort_order ),
      businesses ( name, verification_status ),
      nigerian_states ( name )
    `
    )
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(FEATURED_COUNT);

  const items = listings ?? [];

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
          <Link
            href="/marketplace"
            className="text-sm text-teal-600 hover:text-teal-700"
          >
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {items.map((listing) => {
            const images = listing.product_images ?? [];
            const primary =
              images.find((i) => i.is_primary) ??
              [...images].sort((a, b) => a.sort_order - b.sort_order)[0];
            const biz = Array.isArray(listing.businesses)
              ? listing.businesses[0]
              : listing.businesses;
            const state = Array.isArray(listing.nigerian_states)
              ? listing.nigerian_states[0]
              : listing.nigerian_states;
            return (
              <ListingCard
                key={listing.id}
                id={listing.id}
                title={listing.title}
                priceKobo={listing.price_kobo}
                isNegotiable={listing.is_negotiable}
                primaryImageUrl={primary?.url}
                sellerName={biz?.name}
                isVerified={biz?.verification_status === "verified"}
                stateName={state?.name}
              />
            );
          })}
        </div>
      </Container>
    </section>
  );
}
