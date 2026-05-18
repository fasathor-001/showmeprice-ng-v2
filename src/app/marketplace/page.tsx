import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Card } from "@/components/ui";
import { ListingCard } from "@/components/listings/ListingCard";
import { getProductImagePublicUrl } from "@/lib/storage";
import { sortStatesByFeatured } from "@/lib/states";

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
  // q: strip PostgREST filter special chars so user input can't break the
  // .or() expression. Wildcard %, separator comma, paren grouping, quotes,
  // backslash. Whatever's left is treated as a plain substring.
  const rawQ = String(searchParams.q ?? "").trim();
  const q = rawQ.replace(/[%,()'"\\]/g, "").trim();
  const categorySlug = String(searchParams.category ?? "").trim();
  const stateSlug = String(searchParams.state ?? "").trim();

  // --- Resolve slug -> id (and rollup children for parent categories) ---------
  let categoryName: string | null = null;
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
      // Unknown slug -> impossible filter so we return zero results.
      categoryIds = ["00000000-0000-0000-0000-000000000000"];
    }
  }

  // States list (used for the dropdown + resolving the selected slug -> id).
  const { data: statesData } = await supabase
    .from("nigerian_states")
    .select("id, name, slug");
  const states = sortStatesByFeatured(statesData ?? []);
  const selectedState = stateSlug
    ? (states.find((s) => s.slug === stateSlug) ?? null)
    : null;

  // --- Build the listings query -----------------------------------------------
  // categories(name) is a plain left-join embed so listings without a
  // category aren't excluded — the joined-table .or() clause below still
  // works because PostgREST treats a null categories row as not-matching
  // on that branch, and the OR with title/description carries any
  // category-less hits.
  let query = supabase
    .from("products")
    .select(
      `
      id, title, price_kobo, is_negotiable, created_at,
      product_images ( storage_path, position ),
      businesses!inner ( business_name, verification_status ),
      nigerian_states ( name ),
      categories ( name )
    `
    )
    .eq("status", "active")
    .eq("businesses.verification_status", "verified")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (q) {
    // Match against title, description, AND the joined category name. The
    // last clause uses PostgREST's joined-table filter syntax — requires
    // categories(...) to be in the select (it is, above). D.7.1.
    query = query.or(
      `title.ilike.%${q}%,description.ilike.%${q}%,categories.name.ilike.%${q}%`
    );
  }
  if (categoryIds) {
    query = query.in("category_id", categoryIds);
  }
  if (selectedState) {
    // products.state_id is the listing's location (not the seller's). Matches
    // Section 4's /categories/[slug] filter behaviour for buyer intent.
    query = query.eq("state_id", selectedState.id);
  }

  const { data: listings } = await query;
  const items = listings ?? [];

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
              <p className="text-sm text-ink-600 mb-6">
                Try different keywords, browse all categories, or be the first
                to list something.
              </p>
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
