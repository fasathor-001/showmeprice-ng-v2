import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Badge, Card, Avatar } from "@/components/ui";
import { formatNaira, timeAgo } from "@/lib/listings";

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
      id, title, description, price_kobo, is_negotiable, status, created_at,
      product_images ( url, sort_order, is_primary ),
      categories ( name, slug ),
      nigerian_states ( name ),
      businesses ( id, name, description, verification_status, owner_id )
    `
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!listing || listing.status !== "active") notFound();

  const images = (listing.product_images ?? []).sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return a.sort_order - b.sort_order;
  });
  const primaryImage = images[0]?.url;
  const business = Array.isArray(listing.businesses)
    ? listing.businesses[0]
    : listing.businesses;
  const category = Array.isArray(listing.categories)
    ? listing.categories[0]
    : listing.categories;
  const state = Array.isArray(listing.nigerian_states)
    ? listing.nigerian_states[0]
    : listing.nigerian_states;
  const isVerified = business?.verification_status === "verified";

  return (
    <Container>
      <div className="py-6 sm:py-10">
        {/* Breadcrumb */}
        <div className="mb-6 text-xs text-ink-600 flex items-center gap-1.5">
          <Link href="/marketplace" className="hover:text-ink">
            Marketplace
          </Link>
          {category && (
            <>
              <span>›</span>
              <Link
                href={`/categories/${category.slug}`}
                className="hover:text-ink"
              >
                {category.name}
              </Link>
            </>
          )}
          <span>›</span>
          <span className="text-ink truncate">{listing.title}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Images */}
          <div className="lg:col-span-3">
            <div className="aspect-square bg-neutral-100 rounded-xl overflow-hidden flex items-center justify-center text-neutral-300 mb-3">
              {primaryImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={primaryImage}
                  alt={listing.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <svg
                  width="80"
                  height="80"
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
            {images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {images.slice(0, 8).map((img, idx) => (
                  <div
                    key={idx}
                    className="aspect-square bg-neutral-100 rounded-lg overflow-hidden border border-neutral-200"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Details + contact */}
          <div className="lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {isVerified && (
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
              )}
              {state && <Badge variant="neutral">{state.name}</Badge>}
            </div>

            <h1 className="text-2xl sm:text-3xl font-medium text-ink leading-tight mb-3">
              {listing.title}
            </h1>

            <div className="text-3xl sm:text-4xl font-medium text-ink tabular-nums mb-1">
              {formatNaira(listing.price_kobo)}
            </div>
            <p className="text-xs text-ink-600 mb-6">
              {listing.is_negotiable ? "Price negotiable · " : ""}
              Posted {timeAgo(listing.created_at)}
            </p>

            {/* Placeholder contact button — real flow lands in Phase F */}
            <button
              type="button"
              disabled
              className="w-full bg-teal-600 text-white font-medium text-base px-5 py-3.5 rounded-lg mb-2 inline-flex items-center justify-center gap-2 opacity-60 cursor-not-allowed"
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
            <p className="text-xs text-ink-400 text-center mb-6">
              Contact reveal coming soon
            </p>

            {/* Seller card */}
            {business && (
              <Card>
                <div className="flex items-center gap-3">
                  <Avatar
                    initials={business.name.slice(0, 2)}
                    alt={business.name}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-ink truncate">
                        {business.name}
                      </p>
                      {isVerified && (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="#0F9D58"
                          stroke="white"
                          strokeWidth="2"
                          className="shrink-0"
                          aria-hidden="true"
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
                      )}
                    </div>
                    <p className="text-xs text-ink-600">
                      {isVerified ? "Verified" : "Verification pending"}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Description */}
            <div className="mt-6">
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
