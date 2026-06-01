import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Card } from "@/components/ui";
import { ListingCard } from "@/components/listings/ListingCard";
import { getProductImagePublicUrl } from "@/lib/storage";
import { sortStatesByFeatured } from "@/lib/states";
import {
  filterToLaunchStates,
  launchStateIds,
  LAUNCH_LOCATIONS_LABEL,
} from "@/lib/location/launch-states";

export const runtime = "edge";

const PAGE_SIZE = 24;

interface PageProps {
  searchParams: {
    q?: string;
    category?: string;
    state?: string;
  };
}

export default async function MarketplacePage({ searchParams }: PageProps) {
  const supabase = createClient();

  // --- Sanitise + normalise query params --------------------------------------
  const rawQ = String(searchParams.q ?? "").trim();
  const q = rawQ.replace(/[%,()'"\\]/g, "").trim();
  const categorySlug = String(searchParams.category ?? "").trim();
  const stateSlug = String(searchParams.state ?? "").trim();

  let queryError: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let items: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let states: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let selectedState: any = null;
  let categoryName: string | null = null;

  // K-052: Wrap Supabase queries in try/catch to render inline error state
  try {
    // --- Resolve slug -> id (and rollup children for parent categories) ---------
    let categoryIds: string[] | null = null;
    if (categorySlug) {
      const { data: cat } = await supabase
        .from("categories")
        .select("id, name")
        .eq("slug", categorySlug)
        .maybeSingle();
      if (cat) {
        categoryName = cat.name;
        const { data: children } = await supabase
          .from("categories")
          .select("id")
          .eq("parent_id", cat.id);
        categoryIds = [cat.id, ...(children ?? []).map((c) => c.id)];
      } else {
        categoryIds = ["00000000-0000-0000-0000-000000000000"];
      }
    }

    // States list (used for the dropdown + resolving the selected slug -> id).
    const { data: statesData } = await supabase
      .from("nigerian_states")
      .select("id, name, slug");
    // D-157 launch geographic focus: dropdown shows launch states only; a
    // ?state=<non-launch-slug> URL doesn't resolve (states.find returns
    // undefined) → falls through to the implicit-all-launch path below.
    states = filterToLaunchStates(sortStatesByFeatured(statesData ?? []));
    selectedState = stateSlug
      ? (states.find((s) => s.slug === stateSlug) ?? null)
      : null;

    // --- Search resolution (Phase D.7.2) ----------------------------------------
    let matchedCategoryIds: string[] = [];
    if (q) {
      const lower = q.toLowerCase();
      const { data: matched } = await supabase
        .from("categories")
        .select("id, parent_id")
        .or(`name.ilike.%${q}%,search_aliases.cs.["${lower}"]`);
      const directIds = (matched ?? []).map((c) => c.id);
      if (directIds.length > 0) {
        const { data: children } = await supabase
          .from("categories")
          .select("id")
          .in("parent_id", directIds);
        const childIds = (children ?? []).map((c) => c.id);
        matchedCategoryIds = Array.from(new Set([...directIds, ...childIds]));
      }
    }

    // --- Build the listings query -----------------------------------------------
    let query = supabase
      .from("products")
      .select(
        `
        id, title, price_kobo, is_negotiable, created_at,
        quantity, city_area,
        product_images ( storage_path, position ),
        businesses!inner ( business_name, verification_status ),
        nigerian_states ( name ),
        categories ( supports_inventory )
      `
      )
      .eq("status", "active")
      .eq("businesses.verification_status", "verified")
      // D-146: disabled-seller listings stay invisible on public browse.
      .eq("businesses.is_disabled", false)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (q) {
      const orClauses = [
        `title.ilike.%${q}%`,
        `description.ilike.%${q}%`,
      ];
      if (matchedCategoryIds.length > 0) {
        orClauses.push(`category_id.in.(${matchedCategoryIds.join(",")})`);
      }
      query = query.or(orClauses.join(","));
    }
    if (categoryIds) {
      query = query.in("category_id", categoryIds);
    }
    if (selectedState) {
      query = query.eq("state_id", selectedState.id);
    } else {
      // D-157: implicit "All launch locations" still restricts to launch-
      // state listings (so an unselected dropdown doesn't surface listings
      // from non-launch states). Any pre-existing listing whose state_id
      // is outside the launch set becomes invisible here — intended per
      // the launch-focus decision; flagged at build time.
      query = query.in("state_id", launchStateIds(states));
    }

    const { data: listings, error } = await query;
    if (error) throw error;
    items = listings ?? [];
  } catch (err) {
    console.error("[marketplace]", err);
    queryError = "Couldn't load listings. Please refresh to try again.";
  }

  // --- Heading / chip URL helpers --------------------------------------------
  const heading = buildHeading({
    q,
    categoryName,
    stateName: selectedState?.name ?? null,
  });

  const buildUrl = (
    overrides: Partial<{ q: string; category: string; state: string }>
  ): string => {
    const params = new URLSearchParams();
    const next = {
      q: overrides.q !== undefined ? overrides.q : q,
      category:
        overrides.category !== undefined ? overrides.category : categorySlug,
      state: overrides.state !== undefined ? overrides.state : stateSlug,
    };
    if (next.q) params.set("q", next.q);
    if (next.category) params.set("category", next.category);
    if (next.state) params.set("state", next.state);
    const qs = params.toString();
    return qs ? `/marketplace?${qs}` : "/marketplace";
  };

  const hasFilters = Boolean(q || categorySlug || stateSlug);
  const multipleFilters = [q, categorySlug, stateSlug].filter(Boolean).length > 1;

  return (
    <Container>
      <div className="py-8 sm:py-12">
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

        {/* Toolbar: heading on the left, state filter on the right.
            Stacks on mobile. Keyword search lives in the global header
            (Phase D.5.1) — no input on this page. */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-1">
              {heading}
            </h1>
            <p className="text-sm text-ink-600">
              {items.length === 0
                ? "No verified listings yet"
                : `${items.length} verified ${items.length === 1 ? "listing" : "listings"}`}
              {selectedState ? <> in {selectedState.name}</> : null}
            </p>
          </div>

          {/* State-only form. Preserves the current q + category via hidden
              inputs so the active search/category survives a state change.
              Auto-submits on select change via a tiny inline script (same
              pattern as /categories/[slug]). */}
          <form action="/marketplace" method="get" className="sm:w-56">
            {q && <input type="hidden" name="q" value={q} />}
            {categorySlug && (
              <input type="hidden" name="category" value={categorySlug} />
            )}
            <label>
              <span className="sr-only">Filter by state</span>
              <select
                name="state"
                defaultValue={stateSlug}
                className="block w-full bg-white border border-neutral-300 rounded-lg text-sm text-ink px-3 py-2 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400"
              >
                <option value="">{LAUNCH_LOCATIONS_LABEL}</option>
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

        {/* Active filter chips */}
        {hasFilters && (
          <div className="mb-6 flex flex-wrap gap-2 items-center">
            {q && (
              <FilterChip
                label={<>Search: &ldquo;{q}&rdquo;</>}
                removeHref={buildUrl({ q: "" })}
              />
            )}
            {categorySlug && (
              <FilterChip
                label={
                  <>Category: {categoryName ?? categorySlug}</>
                }
                removeHref={buildUrl({ category: "" })}
              />
            )}
            {selectedState && (
              <FilterChip
                label={selectedState.name}
                removeHref={buildUrl({ state: "" })}
              />
            )}
            {multipleFilters && (
              <Link
                href="/marketplace"
                className="text-xs text-teal-700 hover:text-teal-900 font-medium ml-1"
              >
                Clear all filters
              </Link>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <Card>
            <div className="py-12 text-center max-w-md mx-auto">
              <p className="text-base text-ink mb-2">
                {emptyStatePrimary({
                  q,
                  categoryName,
                  rawCategorySlug: categorySlug,
                  stateName: selectedState?.name ?? null,
                })}
              </p>
              {/* Empty-state escape hatches (Phase D.7.2). When the buyer
                  hit zero results AND a state filter is active, offer to
                  drop the state filter. When nothing's filtered at all,
                  point to /sell. Otherwise fall through to the generic
                  browse / sell CTAs. */}
              {hasFilters && stateSlug && q && (
                <p className="text-sm text-ink-600 mb-6">
                  <Link
                    href={buildUrl({ state: "" })}
                    className="text-teal-700 hover:text-teal-900 underline"
                  >
                    See results for &ldquo;{q}&rdquo; across Nigeria →
                  </Link>
                </p>
              )}
              {hasFilters && stateSlug && !q && (
                <p className="text-sm text-ink-600 mb-6">
                  <Link
                    href={buildUrl({ state: "" })}
                    className="text-teal-700 hover:text-teal-900 underline"
                  >
                    See all verified listings →
                  </Link>
                </p>
              )}
              {!hasFilters && (
                <p className="text-sm text-ink-600 mb-6">
                  Be the first to{" "}
                  <Link
                    href="/sell"
                    className="text-teal-700 hover:text-teal-900 underline"
                  >
                    list something for sale
                  </Link>
                  .
                </p>
              )}
              {hasFilters && !stateSlug && (
                <p className="text-sm text-ink-600 mb-6">
                  Try different keywords, browse all categories, or be the
                  first to list something.
                </p>
              )}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/categories"
                  className="inline-flex items-center justify-center bg-white border border-neutral-300 hover:border-neutral-400 text-ink font-medium text-sm px-5 py-2.5 rounded-lg transition-colors"
                >
                  Browse categories
                </Link>
                <Link
                  href="/sell"
                  className="inline-flex items-center justify-center bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm px-5 py-2.5 rounded-lg transition-colors"
                >
                  Sell on ShowMePrice
                </Link>
              </div>
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
              // E.2.17.0 / Step 2: out-of-stock overlay on the card.
              // Only renders when the category supports inventory AND
              // the listing's quantity is 0.
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
        )}
      </div>
    </Container>
  );
}

function buildHeading({
  q,
  categoryName,
  stateName,
}: {
  q: string;
  categoryName: string | null;
  stateName: string | null;
}): string {
  let base: string;
  if (q) base = `Search results for "${q}"`;
  else if (categoryName) base = categoryName;
  else base = "Browse listings";
  if (stateName) base += ` in ${stateName}`;
  return base;
}

function emptyStatePrimary({
  q,
  categoryName,
  rawCategorySlug,
  stateName,
}: {
  q: string;
  categoryName: string | null;
  rawCategorySlug: string;
  stateName: string | null;
}): string {
  const where = stateName ? ` in ${stateName}` : "";
  if (q && categoryName) {
    return `No verified sellers match "${q}" in ${categoryName}${where}.`;
  }
  if (q) {
    return `No verified sellers match "${q}"${where}.`;
  }
  if (categoryName) {
    return `No verified sellers have listed in ${categoryName}${where} yet.`;
  }
  if (rawCategorySlug) {
    return `No verified sellers have listed in this category${where} yet.`;
  }
  if (stateName) {
    return `No verified sellers in ${stateName} yet.`;
  }
  return "No listings yet.";
}

function FilterChip({
  label,
  removeHref,
}: {
  label: React.ReactNode;
  removeHref: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-ink-600 bg-neutral-100 border border-neutral-200 px-2.5 py-1 rounded-full">
      <span>{label}</span>
      <Link
        href={removeHref}
        aria-label="Remove filter"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-neutral-200 text-ink-600 hover:text-ink"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </Link>
    </span>
  );
}

/**
 * Tiny inline script — auto-submits the parent form when the state <select>
 * changes. Same pattern as /categories/[slug] (Section 4). Server-rendered,
 * no React state.
 */
function StateFilterAutoSubmit() {
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
