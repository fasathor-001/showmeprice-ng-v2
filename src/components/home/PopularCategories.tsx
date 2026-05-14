import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";

// Keys match category.icon_name values seeded in Phase A.
const iconMap: Record<string, () => JSX.Element> = {
  smartphone: () => (
    <SvgIcon path="M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm7 17v.01" />
  ),
  shirt: () => <SvgIcon path="M20 6 12 12 4 6m4-3v3h8V3" />,
  home: () => (
    <SvgIcon path="m3 9 9-7 9 7v11a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2V9Z" />
  ),
  car: () => <SvgIcon path="M7 17h10m-13 0h2v-5l2-5h8l2 5v5h2M7 17v2m10-2v2" />,
  building: () => (
    <SvgIcon path="M6 22V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v18M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />
  ),
  sparkles: () => (
    <SvgIcon path="m12 3-1.9 5.8L4 10.7l4.8 3.3-1.4 6 4.6-3.6 4.6 3.6-1.4-6L20 10.7l-6.1-1.9z" />
  ),
  wrench: () => <SvgIcon path="M14.7 6.3a4 4 0 0 1 5 5L13 18a2.8 2.8 0 1 1-4-4Z" />,
  utensils: () => (
    <SvgIcon path="M3 2v7c0 1.1.9 2 2 2h2v9m6-18v18m4-18v6h2c1.1 0 2 .9 2 2v10" />
  ),
  "heart-pulse": () => (
    <SvgIcon path="m12 21-1.5-1.4C5 14.4 2 11.7 2 8.4A5 5 0 0 1 7 3.4c1.5 0 3 .8 5 2.4 2-1.6 3.5-2.4 5-2.4a5 5 0 0 1 5 5c0 3.3-3 6-8.5 11.2z" />
  ),
  baby: () => <SvgIcon path="M9 9h.01M15 9h.01M8 13s1.5 2 4 2 4-2 4-2" />,
  dumbbell: () => (
    <SvgIcon path="M6 9h12v6H6Zm-4 1v4m20-4v4M3 9v6m18-6v6" />
  ),
  "book-open": () => (
    <SvgIcon path="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2Zm20 0h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8z" />
  ),
  "paw-print": () => (
    <SvgIcon path="M11 14a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm8 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM7 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM12 18s-4 2-4 4h8c0-2-4-4-4-4Z" />
  ),
  factory: () => (
    <SvgIcon path="M2 22V10l6 4V10l6 4V10l6 4v8z M6 18h.01M10 18h.01M14 18h.01M18 18h.01" />
  ),
  tag: () => (
    <SvgIcon path="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13.1V3.5a.5.5 0 0 1 .5-.5h9.6l7.5 7.6a2 2 0 0 1 0 2.8ZM7 7a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
  ),
};

function SvgIcon({ path }: { path: string }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export async function PopularCategories() {
  const supabase = createClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, slug, icon_name")
    .is("parent_id", null)
    .order("sort_order", { ascending: true })
    .limit(7);

  const items = categories ?? [];

  return (
    <section className="py-12 sm:py-16">
      <Container>
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-lg sm:text-xl font-medium text-ink">Popular categories</h2>
          <Link href="/categories" className="text-sm text-teal-600 hover:text-teal-700">
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {items.map((cat) => {
            const Icon = iconMap[cat.icon_name ?? ""] ?? iconMap.tag;
            return (
              <Link
                key={cat.id}
                href={`/marketplace?category=${cat.slug}`}
                className="bg-neutral-50 hover:bg-neutral-100 rounded-xl p-4 text-center transition-colors group"
              >
                <div className="text-teal-600 inline-flex group-hover:scale-105 transition-transform">
                  <Icon />
                </div>
                <div className="mt-2 text-xs sm:text-sm text-ink-800 font-medium">
                  {cat.name}
                </div>
              </Link>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
