import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { Container } from "@/components/layout";

interface PlaceholderListing {
  id: string;
  title: string;
  priceKobo: number;
  isNegotiable: boolean;
  sellerName: string;
  state: string;
  icon: () => JSX.Element;
}

const placeholders: PlaceholderListing[] = [
  {
    id: "1",
    title: "iPhone 15 Pro Max 256GB",
    priceKobo: 125_000_000,
    isNegotiable: false,
    sellerName: "TechHub Lagos",
    state: "Lagos",
    icon: () => (
      <SvgIcon path="M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm7 17v.01" />
    ),
  },
  {
    id: "2",
    title: "3-Seater Leather Sofa",
    priceKobo: 18_500_000,
    isNegotiable: true,
    sellerName: "Adamson Home",
    state: "Abuja",
    icon: () => (
      <SvgIcon path="M3 11v9a1 1 0 0 0 1 1h2v-2h12v2h2a1 1 0 0 0 1-1v-9a3 3 0 0 0-3-3h-1V6a3 3 0 0 0-3-3h-4a3 3 0 0 0-3 3v2H6a3 3 0 0 0-3 3Z" />
    ),
  },
  {
    id: "3",
    title: "2018 Toyota Camry SE",
    priceKobo: 1_250_000_000,
    isNegotiable: false,
    sellerName: "Lekki Autos",
    state: "Lagos",
    icon: () => (
      <SvgIcon path="M7 17h10m-13 0h2v-5l2-5h8l2 5v5h2M7 17v2m10-2v2" />
    ),
  },
];

function SvgIcon({ path }: { path: string }) {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function formatNaira(kobo: number) {
  const naira = Math.floor(kobo / 100);
  return "₦" + naira.toLocaleString("en-NG");
}

export function FeaturedListings() {
  return (
    <section className="py-12 sm:py-16 bg-neutral-50">
      <Container>
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-lg sm:text-xl font-medium text-ink">Featured listings</h2>
          <span className="text-sm text-ink-600">From verified sellers</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {placeholders.map((listing) => (
            <Link key={listing.id} href={`/listings/${listing.id}`}>
              <Card variant="hover" padding="none" className="overflow-hidden">
                <div className="aspect-square bg-neutral-100 flex items-center justify-center text-neutral-300 relative">
                  <listing.icon />
                  <div className="absolute top-2 left-2">
                    <Badge
                      variant="teal"
                      className="bg-white text-teal-700 border border-neutral-200"
                    >
                      FEATURED
                    </Badge>
                  </div>
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-medium text-ink leading-snug mb-1 line-clamp-2">
                    {listing.title}
                  </h3>
                  <div className="flex items-baseline gap-1.5 mb-2">
                    <span className="text-base font-medium text-ink tabular-nums">
                      {formatNaira(listing.priceKobo)}
                    </span>
                    {listing.isNegotiable && (
                      <span className="text-xs text-ink-600">negotiable</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-ink-600">
                    <div className="flex items-center gap-1">
                      <ShieldCheckIcon />
                      <span>{listing.sellerName}</span>
                    </div>
                    <span>{listing.state}</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}

function ShieldCheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#0F9D58"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
