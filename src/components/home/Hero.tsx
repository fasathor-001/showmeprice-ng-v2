import { Container } from "@/components/layout";

export function Hero() {
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

          {/* Search is a stub for Phase A.5; Phase E wires it. */}
          <form action="/marketplace" className="mt-8 max-w-xl mx-auto">
            <div className="flex items-stretch bg-white border border-neutral-300 rounded-xl shadow-card overflow-hidden focus-within:ring-2 focus-within:ring-teal-400">
              <div className="pl-4 self-center text-neutral-400">
                <SearchIcon />
              </div>
              <input
                type="search"
                name="q"
                placeholder="iPhone, generator, sofa…"
                className="flex-1 bg-transparent border-0 outline-none text-base text-ink placeholder:text-neutral-400 px-3 py-3 min-w-0"
                aria-label="Search the marketplace"
              />
              <div className="hidden sm:flex items-center gap-1.5 px-3 border-l border-neutral-200 text-sm text-ink-600">
                <MapPinIcon />
                <span>Lagos</span>
                <ChevronDownIcon />
              </div>
              <button
                type="submit"
                className="bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm px-5 sm:px-6 transition-colors"
              >
                Search
              </button>
            </div>
          </form>
        </div>
      </Container>
    </section>
  );
}

function SearchIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
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
function ChevronDownIcon() {
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
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
