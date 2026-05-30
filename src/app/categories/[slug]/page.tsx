import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Card } from "@/components/ui";
import { ListingCard } from "@/components/listings/ListingCard";
import { PropertyWarningBanner } from "@/components/listings/PropertyWarningBanner";
import { getProductImagePublicUrl } from "@/lib/storage";
import { sortStatesByFeatured } from "@/lib/states";
import { roundRobinBySeller } from "@/lib/listings";

export const runtime = "edge";

const PAGE_SIZE = 24;
// Over-fetch multiplier matching the homepage 4× ratio (D-144). 96 rows
// is the input pool the round-robin samples to produce a seller-diverse
// PAGE_SIZE=24 slice. No pagination on this page today, so a single
// over-fetch is enough — the round-robin shapes the only render the
// buyer sees. If pagination is ever added, page 2+ would either need
// plain recency (Option A from the investigation) or a deterministic
// per-page slicing scheme (Option B).
const OVER_FETCH = PAGE_SIZE * 4;

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { state?: string };
}) {
  const supabase = createClient();

  let queryError: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let category: any = null;
  let parentCategory: { name: string; slug: string } | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let children: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let states: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let items: any[] = [];
  const selectedStateSlug = searchParams.state ?? "";

  try {
    const { data: catData } = await supabase
      .from("categories")
      .select("id, name, parent_id")
      .eq("slug", params.slug)
      .maybeSingle();

    if (!catData) notFound();
    category = catData;

    // Parent (for breadcrumb back-link if this slug is a subcategory).
    if (category.parent_id) {
      const { data: parent } = await supabase
        .from("categories")
        .select("name, slug")
        .eq("id", category.parent_id)
        .maybeSingle();
      parentCategory = parent;
    }

    // Direct children for subcategory chip nav. Empty for subcategory pages.
    const { data: childrenData } = await supabase
      .from("categories")
      .select("id, name, slug, sort_order")
      .eq("parent_id", category.id)
      .order("sort_order", { ascending: true });
    children = childrenData ?? [];

    // States for the filter dropdown (featured-first ordering).
    const { data: statesData } = await supabase
      .from("nigerian_states")
      .select("id, name, slug");
    states = sortStatesByFeatured(statesData ?? []);

    // Resolve state filter slug -> id. Unknown slug = no filter (graceful).
    let selectedStateId: string | null = null;
    if (selectedStateSlug) {
      const match = states.find((s) => s.slug === selectedStateSlug);
      selectedStateId = match?.id ?? null;
    }

    // Build the listings query. If the category is a top-level (has children),
    // include products in any of its subcategories too — the parent page rolls
    // up its descendants. Subcategory pages narrow to that category only.
    const categoryIds = [category.id, ...children.map((c) => c.id)];

    let query = supabase
      .from("products")
      .select(
        `
        id, title, price_kobo, is_negotiable, seller_id, created_at, quantity,
        product_images ( storage_path, position ),
        businesses!inner ( business_name, verification_status ),
        nigerian_states ( name ),
        categories ( supports_inventory )
      `
      )
      .eq("status", "active")
      .in("category_id", categoryIds)
      .eq("businesses.verification_status", "verified")
      // D-146: disabled-seller listings stay invisible on public browse.
      .eq("businesses.is_disabled", false)
      .order("created_at", { ascending: false })
      .limit(OVER_FETCH);

    if (selectedStateId) {
      query = query.eq("state_id", selectedStateId);
    }

    const { data: listings, error } = await query;
    if (error) throw error;
    // D-144 parity: round-robin across sellers so a single prolific seller
    // can't dominate the category page. No pagination on this page today,
    // so this single OVER_FETCH=96 pool feeds the only PAGE_SIZE=24 slice
    // the buyer sees.
    items = roundRobinBySeller(listings ?? [], PAGE_SIZE);
  } catch (err) {
    console.error("[categories]", err);
    queryError = "Couldn't load listings. Please refresh to try again.";
    // Still provide a category name if we got that far
    if (!category) notFound();
  }

  return (
    <Container>
      <div className="py-8 sm:py-12">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="mb-2 text-sm text-ink-600 flex items-center gap-1.5 flex-wrap"
        >
          <Link href="/categories" className="hover:text-ink">
            ← All categories
          </Link>
          {parentCategory && (
            <>
              <span aria-hidden="true">·</span>
              <Link
                href={`/categories/${parentCategory.slug}`}
                className="hover:text-ink"
              >
                {parentCategory.name}
              </Link>
            </>
          )}
        </nav>

        {/* K-052: Error state when Supabase query fails — inline recovery */}
        {queryError && (
          <Card className="mb-6 bg-danger-bg border-danger/30">
            <div className="text-center">
              <p className="text-sm font-medium text-danger-text mb-3">
                {queryError}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700"
              >
                Refresh page
              </button>
            </div>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-1">
              {category.name}
            </h1>
            <p className="text-sm text-ink-600">
              {items.length} {items.length === 1 ? "listing" : "listings"}
              {selectedStateSlug && (
                <>
                  {" "}
                  in{" "}
                  <span className="text-ink">
                    {states.find((s) => s.slug === selectedStateSlug)?.name ??
                      selectedStateSlug}
                  </span>
                </>
              )}
            </p>
          </div>

          {/* State filter — submit-on-change. Server-rendered, no JS. */}
          <form className="sm:w-56" action="" method="get">
            <label className="block">
              <span className="sr-only">Filter by state</span>
              <select
                name="state"
                defaultValue={selectedStateSlug}
                className="block w-full bg-white border border-neutral-300 rounded-lg text-sm text-ink px-3 py-2 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400"
              >
                <option value="">All states</option>
                {states.map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <noscript>
              <button
                type="submit"
                className="mt-2 text-xs text-teal-700 hover:text-teal-900"
              >
                Apply filter
              </button>
            </noscript>
            <StateFilterAutoSubmit />
          </form>
        </div>

        {/* Property-specific caveat. Renders on the parent /categories/property
            page and on any subcategory under it (current taxonomy has none,
            but futureproofed). */}
        {(params.slug === "property" || parentCategory?.slug === "property") && (
          <div className="mb-6">
            <PropertyWarningBanner />
          </div>
        )}

        {/* Subcategory chips (only on a category that has children) */}
        {children.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {children.map((c) => (
              <Link
                key={c.id}
                href={`/categories/${c.slug}`}
                className="inline-flex items-center text-xs sm:text-sm text-ink-600 hover:text-ink bg-white border border-neutral-300 hover:border-neutral-400 px-3 py-1.5 rounded-full transition-colors"
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}

        {items.length === 0 ? (
          <Card>
            <div className="py-12 text-center max-w-md mx-auto">
              <p className="text-base text-ink mb-2">
                No verified sellers have listed in {category.name.toLowerCase()}
                {selectedStateSlug ? " in this state" : ""} yet.
              </p>
              <p className="text-sm text-ink-600 mb-6">
                Check back soon, or be the first to list in this category.
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
                  stateName={state?.name}
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

/**
 * Small client island that auto-submits the parent form on <select> change.
 * Kept tiny so the category page stays mostly server-rendered.
 */
function StateFilterAutoSubmit() {
  // Inline script tag — auto-submits the parent form when the state select
  // changes. Server-rendered, runs once on page load, no React state.
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){
  var s=document.currentScript;
  if(!s)return;
  var form=s.closest('form');
  if(!form)return;
  var sel=form.querySelector('select[name="state"]');
  if(!sel)return;
  sel.addEventListener('change',function(){form.submit();});
})();`,
      }}
    />
  );
}
