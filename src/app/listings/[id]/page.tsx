import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Badge, Card, Avatar } from "@/components/ui";
import { formatNaira, timeAgo } from "@/lib/listings";
import { getProductImagePublicUrl } from "@/lib/storage";
import { ListingImageGallery } from "@/components/listings/ListingImageGallery";
import { PropertyWarningBanner } from "@/components/listings/PropertyWarningBanner";
import {
  getSpecsForCategory,
  labelForSpec,
} from "@/lib/categorySpecs";

export const runtime = "edge";

export default async function ListingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: listing } = await supabase
    .from("products")
    .select(
      `
      id, title, description, price_kobo, is_negotiable, status, created_at, category_specs,
      product_images ( storage_path, position ),
      categories ( id, name, slug, parent_id ),
      nigerian_states ( name, slug ),
      businesses ( id, business_name, description, verification_status, owner_id, created_at, state_id )
    `
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!listing || listing.status !== "active") notFound();

  const business = Array.isArray(listing.businesses)
    ? listing.businesses[0]
    : listing.businesses;

  // Visibility gate (Phase C.5.4): defensive 404 even though RLS P.2 should
  // already filter unverified businesses out of public queries.
  if (!business || business.verification_status !== "verified") notFound();

  const category = Array.isArray(listing.categories)
    ? listing.categories[0]
    : listing.categories;
  const state = Array.isArray(listing.nigerian_states)
    ? listing.nigerian_states[0]
    : listing.nigerian_states;

  // Parent category for breadcrumb (e.g. "Mobile Phones & Tablets >
  // Smartphones (Pre-owned)"). Only fetched when the listing's category
  // is a subcategory.
  let parentCategory: { name: string; slug: string } | null = null;
  if (category?.parent_id) {
    const { data: parent } = await supabase
      .from("categories")
      .select("name, slug")
      .eq("id", category.parent_id)
      .maybeSingle();
    parentCategory = parent;
  }

  // Property listings carry a category-wide warning (D.4.1) — we don't
  // verify titles or ownership. Matches when the listing is in 'property'
  // directly OR in any subcategory of 'property' (futureproofed; current
  // taxonomy has no subs under property but Phase D.4.1 spec calls it out).
  const isPropertyTree =
    category?.slug === "property" || parentCategory?.slug === "property";

  // Seller's state (where the business operates from) — separate from the
  // listing's state. Used in the seller info card.
  let sellerState: { name: string } | null = null;
  if (business.state_id) {
    const { data: bs } = await supabase
      .from("nigerian_states")
      .select("name")
      .eq("id", business.state_id)
      .maybeSingle();
    sellerState = bs;
  }

  const images = [...(listing.product_images ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((img) => ({
      storage_path: img.storage_path,
      public_url: getProductImagePublicUrl(img.storage_path),
    }));

  // Member-since label, formatted "Member since May 2026" style.
  const memberSince = new Date(business.created_at).toLocaleDateString(
    "en-NG",
    { year: "numeric", month: "long" }
  );

  return (
    <Container>
      <div className="py-6 sm:py-10">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="mb-6 text-xs text-ink-600 flex items-center gap-1.5 flex-wrap"
        >
          <Link href="/marketplace" className="hover:text-ink">
            Marketplace
          </Link>
          {parentCategory && (
            <>
              <span aria-hidden="true">›</span>
              <Link
                href={`/categories/${parentCategory.slug}`}
                className="hover:text-ink"
              >
                {parentCategory.name}
              </Link>
            </>
          )}
          {category && (
            <>
              <span aria-hidden="true">›</span>
              <Link
                href={`/categories/${category.slug}`}
                className="hover:text-ink"
              >
                {category.name}
              </Link>
            </>
          )}
          <span aria-hidden="true">›</span>
          <span className="text-ink truncate max-w-[16ch] sm:max-w-none">
            {listing.title}
          </span>
        </nav>

        {isPropertyTree && (
          <div className="mb-6">
            <PropertyWarningBanner />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Gallery */}
          <div className="lg:col-span-3">
            <ListingImageGallery images={images} title={listing.title} />
          </div>

          {/* Details */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge
                  variant="verified"
                  leftIcon={
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      aria-hidden="true"
                    >
                      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  }
                >
                  Verified seller
                </Badge>
                {state && (
                  <Badge
                    variant="neutral"
                    leftIcon={
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    }
                  >
                    {state.name}
                  </Badge>
                )}
                {listing.is_negotiable && (
                  <Badge variant="teal">Price negotiable</Badge>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-medium text-ink leading-tight mb-3">
                {listing.title}
              </h1>

              <div className="text-3xl sm:text-4xl font-medium text-teal-700 tabular-nums mb-1">
                {formatNaira(listing.price_kobo)}
              </div>
              <p className="text-xs text-ink-600">
                Listed {timeAgo(listing.created_at)}
              </p>
            </div>

            {/* Placeholder contact button — Phase E wires WhatsApp reveal */}
            <div>
              <button
                type="button"
                disabled
                className="w-full bg-teal-600 text-white font-medium text-base px-5 py-3.5 rounded-lg inline-flex items-center justify-center gap-2 opacity-60 cursor-not-allowed"
                aria-label="WhatsApp contact coming soon"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M17.6 6.31999C16.8 5.51999 15.8 4.91999 14.8 4.51999C13.7 4.11999 12.6 3.91999 11.5 3.91999C10.4 3.91999 9.3 4.11999 8.3 4.51999C7.3 4.91999 6.3 5.51999 5.5 6.31999C4.7 7.11999 4.1 8.11999 3.7 9.21999C3.3 10.3 3.1 11.4 3.1 12.5C3.1 13.6 3.3 14.7 3.7 15.7L3 21L8.5 19.5C9.5 19.9 10.5 20.1 11.6 20.1C12.7 20.1 13.8 19.9 14.8 19.5C15.8 19.1 16.8 18.5 17.6 17.7C18.4 16.9 19 15.9 19.4 14.9C19.8 13.9 20 12.8 20 11.7C20 10.6 19.8 9.49999 19.4 8.39999C19 7.49999 18.4 6.59999 17.6 6.31999Z" />
                </svg>
                <span>Chat seller on WhatsApp</span>
              </button>
              <p className="text-xs text-ink-400 text-center mt-2">
                Contact reveal coming soon
              </p>
            </div>

            {/* Seller info card */}
            <Card>
              <div className="flex items-start gap-3 mb-4">
                <Avatar
                  initials={business.business_name.slice(0, 2)}
                  alt={business.business_name}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium text-ink truncate">
                      {business.business_name}
                    </p>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="#0F9D58"
                      className="shrink-0"
                      aria-label="Verified"
                    >
                      <circle cx="12" cy="12" r="11" />
                      <path
                        d="m9 12 2 2 4-4"
                        stroke="white"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  </div>
                  <p className="text-xs text-ink-600 mt-0.5">
                    Member since {memberSince}
                    {sellerState && <> · {sellerState.name}</>}
                  </p>
                </div>
              </div>

              {/* Trust details — admin approval requires NIN + address + ID
                  + selfie, so a verified seller has all three checks. We
                  render the badges based on verification_status rather than
                  re-querying seller_verifications (which is RLS-restricted
                  to seller/admin reads). */}
              <div className="flex flex-wrap gap-1.5">
                <TrustChip label="NIN verified" />
                <TrustChip label="Address verified" />
                <TrustChip label="ID verified" />
              </div>
            </Card>

            {/* Specifications (D.7) — only renders if category_specs has
                values. Labels resolve through the same per-category schema
                used by the form, so they stay human-readable even when the
                spec set evolves. */}
            {(() => {
              const specs = listing.category_specs as
                | Record<string, string | number>
                | null
                | undefined;
              if (!specs || Object.keys(specs).length === 0) return null;
              const schema = getSpecsForCategory(
                category?.slug,
                parentCategory?.slug
              );
              return (
                <div>
                  <h2 className="text-sm font-medium text-ink mb-2">
                    Specifications
                  </h2>
                  <dl className="text-sm space-y-1.5">
                    {Object.entries(specs).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex justify-between gap-2 border-b border-neutral-100 pb-1.5 last:border-b-0"
                      >
                        <dt className="text-ink-600">
                          {labelForSpec(schema, key)}
                        </dt>
                        <dd className="text-ink text-right">
                          {String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })()}

            {/* Description */}
            <div>
              <h2 className="text-sm font-medium text-ink mb-2">Description</h2>
              <p className="text-sm text-ink-600 whitespace-pre-line leading-relaxed">
                {listing.description}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}

function TrustChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-verified-text bg-verified-bg/60 border border-verified/20 px-2 py-0.5 rounded">
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        aria-hidden="true"
      >
        <path d="m9 12 2 2 4-4" />
      </svg>
      {label}
    </span>
  );
}
