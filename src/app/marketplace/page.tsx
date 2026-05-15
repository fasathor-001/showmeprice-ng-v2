import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Card } from "@/components/ui";
import { ListingCard } from "@/components/listings/ListingCard";
import { getProductImagePublicUrl } from "@/lib/storage";

export const runtime = "edge";

const PAGE_SIZE = 24;

export default async function MarketplacePage() {
  const supabase = createClient();

  // Visibility gate (Phase C.5.4 + RLS policy P.2): only show listings whose
  // business is verified. `!inner` forces a real join so the verification_status
  // filter applies at the join layer instead of post-filtering nulls.
  const { data: listings } = await supabase
    .from("products")
    .select(
      `
      id, title, price_kobo, is_negotiable, created_at,
      product_images ( storage_path, position ),
      businesses!inner ( business_name, verification_status ),
      nigerian_states ( name )
    `
    )
    .eq("status", "active")
    .eq("businesses.verification_status", "verified")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const items = listings ?? [];

  return (
    <Container>
      <div className="py-8 sm:py-12">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-1">
            Marketplace
          </h1>
          <p className="text-sm text-ink-600">
            Real prices from verified sellers across Nigeria.
          </p>
        </div>

        {items.length === 0 ? (
          <Card>
            <div className="py-12 text-center max-w-md mx-auto">
              <p className="text-base text-ink mb-2">No listings yet.</p>
              <p className="text-sm text-ink-600 mb-6">
                ShowMePrice is just getting started. Be the first to list
                something.
              </p>
              <Link
                href="/sell"
                className="inline-flex items-center justify-center bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm px-5 py-2.5 rounded-lg transition-colors"
              >
                Sell on ShowMePrice
              </Link>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((listing) => {
              const images = listing.product_images ?? [];
              const primary = [...images].sort(
                (a, b) => a.position - b.position
              )[0];
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
                  primaryImageUrl={
                    primary
                      ? getProductImagePublicUrl(primary.storage_path)
                      : undefined
                  }
                  sellerName={biz?.business_name}
                  isVerified={biz?.verification_status === "verified"}
                  stateName={state?.name}
                />
              );
            })}
          </div>
        )}
      </div>
    </Container>
  );
}
