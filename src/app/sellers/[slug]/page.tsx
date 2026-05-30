import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Avatar, Badge, Card, ToastFromSearchParams } from "@/components/ui";
import { ListingCard } from "@/components/listings/ListingCard";
import { ReportUserButton } from "@/components/users/ReportUserButton";
import {
  getBusinessAvatarPublicUrl,
  getProductImagePublicUrl,
} from "@/lib/storage";

// E.2.18.0 / D-142 Step 2 — public seller shop page at /sellers/[slug].
// The per-seller browse surface that lets buyers discover a seller's
// full active range after engaging with a single listing.
//
// Visibility gate: verification_status='verified' AND is_disabled=false.
// Unsubmitted / rejected / disabled businesses 404 cleanly. Direct-URL
// probing of an unverified slug is not a discovery affordance.
//
// Listings filter: status='active' (applied client-side in JS — embedded
// children filter via PostgREST is awkward enough that the JS pass
// is cleaner). Sold/draft/archived listings don't appear.
//
// Per-listing card matches the marketplace/homepage cards exactly,
// including the E.2.17.0 out-of-stock overlay parity. No per-listing
// WhatsApp reveal at page level — the per-listing reveal preserves
// the D-091/D-129/D-133 per-listing accounting model.

export const runtime = "edge";

interface PageProps {
  params: { slug: string };
}

interface EmbeddedProduct {
  id: string;
  title: string;
  price_kobo: number;
  is_negotiable: boolean;
  created_at: string;
  status: string;
  quantity: number;
  product_images: { storage_path: string; position: number }[] | null;
  nigerian_states: { name: string } | { name: string }[] | null;
  categories:
    | { supports_inventory: boolean }
    | { supports_inventory: boolean }[]
    | null;
}

interface BusinessRow {
  id: string;
  slug: string;
  business_name: string;
  description: string | null;
  verification_status: string;
  logo_path: string | null;
  city_area: string | null;
  created_at: string;
  is_disabled: boolean;
  // Feature K: owner_id surfaced so the page can decide whether to
  // render the "Report user" affordance for the viewing buyer (button
  // is hidden when viewer is the seller themselves).
  owner_id: string;
  nigerian_states: { name: string } | { name: string }[] | null;
  products: EmbeddedProduct[] | null;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("businesses")
    .select("business_name, verification_status, is_disabled")
    .eq("slug", params.slug)
    .maybeSingle();
  if (
    !data ||
    data.verification_status !== "verified" ||
    data.is_disabled === true
  ) {
    return { title: "Seller not found · ShowMePrice" };
  }
  return {
    title: `${data.business_name} · ShowMePrice`,
    robots: { index: true, follow: true },
  };
}

export default async function SellerShopPage({ params }: PageProps) {
  const supabase = createClient();

  // Single query: business + embedded products + embedded states/cats.
  // Visibility filters in the WHERE clause kill unverified/disabled
  // accounts at the DB level. Listing status filter happens in JS
  // (PostgREST embed filtering is awkward enough that the JS pass is
  // simpler than the SQL).
  // Feature K: resolve current user in parallel with the business
  // query — used to gate the Report button (signed-in + not-self).
  // The auth call is cheap (cookie + JWT decode), so running it
  // unconditionally is simpler than threading conditional resolution.
  const [{ data: businessRaw }, { data: { user } }] = await Promise.all([
    supabase
      .from("businesses")
      .select(
        `
      id, slug, business_name, description, verification_status,
      logo_path, city_area, created_at, is_disabled, owner_id,
      nigerian_states ( name ),
      products (
        id, title, price_kobo, is_negotiable, created_at, status,
        quantity,
        product_images ( storage_path, position ),
        nigerian_states ( name ),
        categories ( supports_inventory )
      )
    `,
      )
      .eq("slug", params.slug)
      .eq("verification_status", "verified")
      .eq("is_disabled", false)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!businessRaw) notFound();

  const business = businessRaw as unknown as BusinessRow;
  const state = Array.isArray(business.nigerian_states)
    ? (business.nigerian_states[0] ?? null)
    : business.nigerian_states;

  // Filter to active listings only. (Out-of-stock listings are status
  // 'active' with quantity=0 per E.2.17.0/D-141 — they DO appear here
  // with the out-of-stock badge, same as marketplace + homepage.)
  const activeListings = (business.products ?? []).filter(
    (p) => p.status === "active",
  );

  // Sort newest first — matches the marketplace and homepage default.
  activeListings.sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  const memberSince = new Date(business.created_at).toLocaleDateString(
    "en-NG",
    { year: "numeric", month: "long" },
  );

  const locationLine = [business.city_area, state?.name]
    .filter(Boolean)
    .join(" · ");

  return (
    <Container>
      <ToastFromSearchParams />
      <div className="py-8 sm:py-12">
        {/* Shop header */}
        <div className="flex items-start gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Avatar
            src={getBusinessAvatarPublicUrl(business.logo_path)}
            initials={business.business_name.slice(0, 2)}
            alt={business.business_name}
            size="xl"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-2xl sm:text-3xl font-medium text-ink leading-tight">
                {business.business_name}
              </h1>
              <Badge variant="verified">Verified</Badge>
            </div>
            {locationLine && (
              <p className="text-sm text-ink-600 mt-0.5">{locationLine}</p>
            )}
            <p className="text-xs text-ink-400 mt-1">
              Member since {memberSince} · {activeListings.length} active{" "}
              {activeListings.length === 1 ? "listing" : "listings"}
            </p>
            {/* Feature K — report-user affordance. Signed-in-only and
                not visible when the viewer is the seller themselves
                (defense-in-depth gates: server-action also blocks
                self-report). Subtle styling so it doesn't crowd the
                shop-header info hierarchy. */}
            {user && user.id !== businessRaw.owner_id && (
              <div className="mt-2">
                <ReportUserButton
                  targetUserId={businessRaw.owner_id}
                  targetDisplayName={businessRaw.business_name}
                  redirectTo={`/sellers/${businessRaw.slug}`}
                />
              </div>
            )}
          </div>
        </div>

        {/* Optional description (existing businesses.description column,
            already populated for some sellers — surfaces here when set). */}
        {business.description && (
          <div className="mb-8 max-w-2xl">
            <p className="text-sm text-ink-600 whitespace-pre-line leading-relaxed">
              {business.description}
            </p>
          </div>
        )}

        {/* Listings grid (or empty state) */}
        {activeListings.length === 0 ? (
          <Card>
            <div className="py-12 text-center max-w-md mx-auto">
              <p className="text-base text-ink mb-2">
                No active listings right now.
              </p>
              <p className="text-sm text-ink-600 mb-6">
                Check back soon — this seller may be restocking.
              </p>
              <Link
                href="/marketplace"
                className="inline-flex items-center justify-center bg-white border border-neutral-300 hover:border-neutral-400 text-ink font-medium text-sm px-5 py-2.5 rounded-lg transition-colors"
              >
                Browse all sellers
              </Link>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {activeListings.map((listing) => {
              const images = listing.product_images ?? [];
              const primary = [...images].sort(
                (a, b) => a.position - b.position,
              )[0];
              const listingState = Array.isArray(listing.nigerian_states)
                ? listing.nigerian_states[0]
                : listing.nigerian_states;
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
                  stateName={listingState?.name}
                  outOfStock={outOfStock}
                />
              );
            })}
          </div>
        )}
      </div>
    </Container>
  );
}
