import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isPhoneVerified } from "@/lib/auth";
import { Container } from "@/components/layout";
import { Badge, Card, Avatar } from "@/components/ui";
import { formatNaira, timeAgo } from "@/lib/listings";
import {
  getProductImagePublicUrl,
  getBusinessAvatarPublicUrl,
} from "@/lib/storage";
import { ListingImageGallery } from "@/components/listings/ListingImageGallery";
import { MessageSellerButton } from "@/components/listings/MessageSellerButton";
import { ListingShareBar } from "@/components/listings/ListingShareBar";
import { ListingReportButton } from "@/components/listings/ListingReportButton";
import { PropertyWarningBanner } from "@/components/listings/PropertyWarningBanner";
import { MoreFromSeller } from "@/components/listings/MoreFromSeller";
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
      quantity,
      product_images ( storage_path, position ),
      categories ( id, name, slug, parent_id, supports_inventory ),
      nigerian_states ( name, slug ),
      businesses ( id, slug, business_name, description, verification_status, owner_id, created_at, state_id, logo_path, is_disabled )
    `
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!listing || listing.status !== "active") notFound();

  const business = Array.isArray(listing.businesses)
    ? listing.businesses[0]
    : listing.businesses;

  // Visibility gate (Phase C.5.4 verification + D-146 is_disabled contract):
  // defensive 404 mirroring the shop page filter at /sellers/[slug].
  // The direct listing URL must not render for a disabled seller — same
  // contract parity as the shop page itself 404-ing.
  if (
    !business ||
    business.verification_status !== "verified" ||
    business.is_disabled === true
  )
    notFound();

  const category = Array.isArray(listing.categories)
    ? listing.categories[0]
    : listing.categories;
  const state = Array.isArray(listing.nigerian_states)
    ? listing.nigerian_states[0]
    : listing.nigerian_states;

  // E.2.17.0 / Step 2: derive out-of-stock state. Renders an "Out of
  // stock" badge in the badge row below. Suppressed when the category
  // doesn't support inventory (vehicles/property/etc. — single-instance
  // categories don't have a stock concept).
  const outOfStock =
    category?.supports_inventory === true &&
    Number(listing.quantity ?? 1) === 0;

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

  // Vehicle listings carry a category-wide inspection + documents
  // disclaimer (Stage 1 of the car flow). Matches when the listing is
  // in 'vehicles' directly OR in any subcategory (cars, motorcycles,
  // tricycles, vehicle-parts). Renders between the Specifications and
  // Description blocks below. Same shape as isPropertyTree above —
  // category-tree derivation kept in this file rather than helper-
  // extracted because there are only two trees that need it today.
  const isVehicleListing =
    category?.slug === "vehicles" || parentCategory?.slug === "vehicles";

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
  // Feature F: the "More from this seller" rail query runs in parallel
  // with the auth call so the rail adds zero serial round-trips on edge.
  // The inner currentUser-gated Promise.all below stays as-is — it has
  // a real data dependency on currentUser that this top-level pair does
  // not. Visibility gates already passed above (lines 56–61), so the
  // rail's seller is known verified + !is_disabled by D-146 contract.
  const [
    {
      data: { user: currentUser },
    },
    { data: moreFromSeller },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("products")
      .select(
        `
        id, title, price_kobo, is_negotiable, created_at, quantity,
        product_images ( storage_path, position ),
        nigerian_states ( name ),
        categories ( supports_inventory )
      `,
      )
      .eq("status", "active")
      .eq("business_id", business.id)
      .neq("id", listing.id)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

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
            {/* Header with report button. Feature H: visible "Details"
                label dropped — the H1 title + badge row below already
                serve as the visual entry. h2 retained as sr-only so the
                landmark hierarchy stays intact for assistive tech. */}
            <div className="flex justify-end">
              <h2 className="sr-only">Details</h2>
              <ListingReportButton
                listingId={listing.id}
                listingTitle={listing.title}
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {/* E.2.17.0 / Step 2: most prominent of the badges —
                    placed first so the buyer sees stock state before
                    the verified-seller / state / negotiable signals. */}
                {outOfStock && (
                  <Badge variant="warning">Out of stock</Badge>
                )}
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
              {/* E.2.17.0 / Feature H: out-of-stock indicator at the
                  action point. The badge row above already signals
                  stock state, but on mobile the buyer reaches the
                  sticky-bottom CTA via the price/timestamp block — this
                  one-liner keeps stock context co-located with the
                  action. CTA itself stays active per Frank's lean:
                  buyers asking about restock is high-value, low-friction. */}
              {outOfStock && (
                <p className="text-sm text-warning-text mt-1">
                  Currently out of stock — message the seller about restock.
                </p>
              )}
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
                  src={getBusinessAvatarPublicUrl(
                    typeof business.logo_path === "string"
                      ? business.logo_path
                      : null,
                  )}
                  initials={business.business_name.slice(0, 2)}
                  alt={business.business_name}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* E.2.18.0 / D-142: business name links to the
                        public seller shop page. */}
                    <Link
                      href={`/sellers/${business.slug}`}
                      className="text-sm font-medium text-ink hover:text-teal-700 truncate"
                    >
                      {business.business_name}
                    </Link>
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
                  {/* E.2.18.0 / D-142: discoverability CTA into the
                      seller's full shop catalogue. */}
                  <Link
                    href={`/sellers/${business.slug}`}
                    className="inline-block text-xs text-teal-700 hover:text-teal-900 font-medium mt-1.5"
                  >
                    Visit seller shop{" "}
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>

              {/* Trust details — admin approval requires NIN + address + ID
                  + selfie, so a verified seller has all three checks. We
                  render the badges based on verification_status rather than
                  re-querying seller_verifications (which is RLS-restricted
                  to seller/admin reads). Feature H: micro-label above the
                  chip group so the chips read as a trust signal rather
                  than free-floating decorations. */}
              <p className="text-xs text-ink-600 mb-2">Identity verified</p>
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
                        <dt className="text-ink-600 min-w-0">
                          {labelForSpec(schema, key)}
                        </dt>
                        <dd className="text-ink text-right min-w-0">
                          {String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })()}

            {/* Vehicle inspection + documents disclaimer (Stage 1 of the
                car flow). Sits between Specifications and Description so
                buyers see it after reading the structured data and before
                the seller's free-text pitch. One sentence; matches the
                page's calm density. Wording deliberately stops short of
                any platform guarantee — ShowMePrice has not inspected
                the vehicle and does not verify documents. */}
            {isVehicleListing && (
              <div className="bg-warning-bg/40 border border-warning/20 rounded-lg p-3 text-sm text-ink-600">
                Before payment: inspect the vehicle in person, verify
                ownership documents, and confirm customs duty papers
                where applicable. Use a trusted mechanic for inspection.
              </div>
            )}

            {/* Description */}
            <div>
              <h2 className="text-sm font-medium text-ink mb-2">Description</h2>
              <p className="text-sm text-ink-600 whitespace-pre-line leading-relaxed">
                {listing.description}
              </p>
            </div>
          </div>
        </div>

        {/* Feature F — "More from this seller" rail. Renders below the
            2-column grid so the cards span full-width on lg (matching the
            marketplace/homepage/category grid shape). Component returns
            null when the seller has no other active listings. */}
        <MoreFromSeller
          businessName={business.business_name}
          businessSlug={business.slug}
          listings={moreFromSeller ?? []}
        />
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
