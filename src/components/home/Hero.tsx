import Link from "next/link";
import { Container } from "@/components/layout";
import { createClient } from "@/lib/supabase/server";
import {
  sortStatesByFeatured,
  getFeaturedCityChips,
} from "@/lib/states";

export async function Hero() {
  const supabase = createClient();
  const { data: statesData } = await supabase
    .from("nigerian_states")
    .select("id, name, slug");
  const states = sortStatesByFeatured(statesData ?? []);

  // City chips ordered by actual listing count (D.6.2). Top 9 by verified-
  // active listing count, ties broken by FEATURED_STATE_SLUGS order, padded
  // with the featured fallback if fewer than 9 states have listings.
  const cityChips = await getFeaturedCityChips(supabase, states);

  return (
    <section className="bg-neutral-50 border-b border-neutral-200">
      <Container>
        <div className="py-12 sm:py-20 text-center max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-medium text-ink leading-tight tracking-tight">
            Nigeria&apos;s verified marketplace.
          </h1>
          <p className="mt-4 text-base text-ink-600 max-w-md mx-auto">
            Buy from sellers verified with NIN, address, and ID. Real prices,
            no scams, one tap to chat on WhatsApp.
          </p>

          {/* State picker — global search lives in the header (D.5.1). */}
          <form action="/marketplace" className="mt-8 max-w-md mx-auto">
            <div className="flex items-stretch bg-white border border-neutral-300 rounded-xl shadow-card overflow-hidden focus-within:ring-2 focus-within:ring-teal-400">
              <label className="flex flex-1 items-center gap-1.5 px-3 border-r border-neutral-200">
                <span className="text-neutral-400 shrink-0">
                  <MapPinIcon />
                </span>
                <span className="sr-only">State</span>
                <select
                  name="state"
                  defaultValue=""
                  aria-label="Filter by state"
                  className="flex-1 bg-transparent border-0 outline-none text-base text-ink-600 py-3 cursor-pointer focus:text-ink"
                >
                  <option value="">All Nigeria</option>
                  {states.map((s) => (
                    <option key={s.id} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm px-5 sm:px-6 transition-colors"
              >
                Browse listings
              </button>
            </div>
          </form>

          {/* City quick-pick chips. Labels are buyer-friendly city names; the
              href still carries the canonical ?state=<slug> so the marketplace
              filter works unchanged. Order is dynamic (D.6.2) — most-listed
              first, padded with the featured fallback when sparse. */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {cityChips.map((chip) => (
              <Link
                key={chip.stateSlug}
                href={`/marketplace?state=${chip.stateSlug}`}
                className="inline-flex items-center text-xs sm:text-sm text-ink-600 hover:text-ink bg-white border border-neutral-300 hover:border-neutral-400 px-3 py-1.5 rounded-full transition-colors"
              >
                {chip.label}
              </Link>
            ))}
            <Link
              href="/marketplace"
              className="inline-flex items-center text-xs sm:text-sm text-teal-700 hover:text-teal-900 px-3 py-1.5"
            >
              All states →
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}

function MapPinIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
