import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isPhoneVerified } from "@/lib/auth";
import { Container } from "@/components/layout";
import { Badge, Card, Avatar } from "@/components/ui";
import { formatNaira, timeAgo } from "@/lib/listings";
import { getProductImagePublicUrl } from "@/lib/storage";
import { ListingImageGallery } from "@/components/listings/ListingImageGallery";
import { MessageSellerButton } from "@/components/listings/MessageSellerButton";
import { ListingShareBar } from "@/components/listings/ListingShareBar";
import { ListingReportButton } from "@/components/listings/ListingReportButton";
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

  // Stage 2.B Commit 7 — auth + verification + existing-conversation state
  // for the MessageSellerButton. Three pieces drive the five button states:
  //   - user            → "Sign in to message" vs. signed-in states
  //   - phoneVerified   → "Verify phone to message" vs. ready state (D-114)
  //   - existingConvId  → "Continue conversation" vs. "Message seller"
  // isOwnListing hides the button entirely (computed from business.owner_id).
  //
  // All three queries run in parallel with each other (the listing query
  // above is the gate — without a verified listing we 404 before reaching
  // here, so the parallelism only kicks in for valid listings).
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  let currentUserPhoneVerified = false;
  let existingConversationId: string | null = null;
  if (currentUser) {
    const [profileRes, convRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("verification_status")
        .eq("id", currentUser.id)
        .maybeSingle(),
      // Existing-conversation detection drives the "Continue conversation"
      // CTA. RLS allows the buyer to read their own conversations.
      supabase
        .from("conversations")
        .select("id")
        .eq("buyer_id", currentUser.id)
        .eq("seller_id", business.owner_id)
        .eq("listing_id", listing.id)
        .eq("conversation_type", "buyer_seller")
        .maybeSingle(),
    ]);
    currentUserPhoneVerified = isPhoneVerified(
      profileRes.data?.verification_status,
    );
    existingConversationId = (convRes.data?.id as string | undefined) ?? null;
  }

  const isOwnListing =
    currentUser !== null && currentUser.id === business.owner_id;

  const primaryListingImageUrl = images[0]?.public_url ?? null;

  return (
    <Container>
      {/* Commit 7 (A refinement): pb-24 lg:pb-10 leaves ~96px of bottom
          space on mobile so content isn't hidden behind the sticky-bottom
          MessageSellerButton action bar. Desktop drops back to the normal
          10-unit bottom padding. */}
      <div className="pt-6 sm:pt-10 pb-24 lg:pb-10">
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
          {/* D-121 (Commit 4.2): breadcrumb title wraps to its own row at all
              viewports — `basis-full` in a flex-wrap parent forces the title
              onto a new line so the full text reads cleanly. Replaces the
              previous mobile truncation (`truncate max-w-[16ch]`). */}
          <span className="text-ink basis-full">
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
            {/* Header with report button */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-ink-600">Details</h2>
              <ListingReportButton
                listingId={listing.id}
                listingTitle={listing.title}
              />
            </div>

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

            {/* Stage 2.B Commit 7 — MessageSellerButton. Replaces the
                previous disabled WhatsApp placeholder. Renders both the
                inline desktop button (here) AND a sticky-bottom mobile
                action bar (mounted into a fixed position; visible only
                on <lg). Component owns the 5 visibility states + modal. */}
            <MessageSellerButton
              listingId={listing.id}
              listingTitle={listing.title}
              listingPriceKobo={listing.price_kobo}
              listingPrimaryImageUrl={primaryListingImageUrl}
              sellerBusinessName={business.business_name}
              userId={currentUser?.id ?? null}
              isPhoneVerified={currentUserPhoneVerified}
              isOwnListing={isOwnListing}
              existingConversationId={existingConversationId}
            />

            {/* Commit 12 K-060.5 — WhatsApp share + Copy link buttons.
                DP-207: Share button next to WhatsApp CTA. Uses formatNaira()
                for Nigerian price format consistency (DP-205). Clipboard API
                with graceful fallback (DP-206). No success toast per D-124. */}
            <ListingShareBar
              listingId={listing.id}
              listingTitle={listing.title}
              listingPriceKobo={listing.price_kobo}
              listingStateName={state?.name ?? null}
            />

            {/* Future Phase E: D-113 contact-reveal CTA lands separately —
                a paid path to reveal the seller's WhatsApp/phone. In-platform
                messaging (above) stays as the trust-first primary affordance. */}

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
