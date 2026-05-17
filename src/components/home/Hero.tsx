import { Container } from "@/components/layout";
import { createClient } from "@/lib/supabase/server";
import { sortStatesByFeatured } from "@/lib/states";

export async function Hero() {
  const supabase = createClient();
  const { data: statesData } = await supabase
    .from("nigerian_states")
    .select("id, name, slug");
  const states = sortStatesByFeatured(statesData ?? []);

  return (
    <section className="bg-neutral-50 border-b border-neutral-200">
      <Container>
        <div className="py-14 sm:py-20 text-center max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-medium text-ink leading-tight tracking-tight">
            Real prices, verified sellers,
            <br className="hidden sm:inline" /> one tap to chat.
          </h1>
          <p className="mt-4 text-base text-ink-600 max-w-md mx-auto">
            Nigeria&apos;s marketplace where every listing has a price and every seller is verified.
          </p>

          {/* State picker only — global search lives in the header (D.5.1).
              Pick a state, click Browse, land on the marketplace filtered. */}
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
