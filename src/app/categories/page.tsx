import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Card } from "@/components/ui";
import { getCategoryEmoji } from "@/lib/categories";

export const runtime = "edge";

interface TopCategory {
  id: string;
  name: string;
  slug: string;
  icon_name: string | null;
  tier: number;
  sort_order: number;
}

export default async function CategoriesIndexPage() {
  const supabase = createClient();

  // All top-level categories (parent_id IS NULL). Tier filters happen in
  // memory — small dataset (~16 rows) and the tiers all render in one pass.
  const { data: topCategoriesData } = await supabase
    .from("categories")
    .select("id, name, slug, icon_name, tier, sort_order")
    .is("parent_id", null)
    .order("tier", { ascending: true })
    .order("sort_order", { ascending: true });

  const topCategories: TopCategory[] = topCategoriesData ?? [];

  // All subcategories — needed to roll up listing counts to their Tier 1/2/3
  // parents (a listing in 'Smartphones (Pre-owned)' should add to the
  // 'Mobile Phones & Tablets' card's count on this page).
  const { data: subCategoriesData } = await supabase
    .from("categories")
    .select("id, parent_id")
    .not("parent_id", "is", null);

  // category_id -> top-level (own id if itself top-level, parent_id otherwise)
  const idToTopLevel = new Map<string, string>();
  for (const top of topCategories) idToTopLevel.set(top.id, top.id);
  for (const sub of subCategoriesData ?? []) {
    if (sub.parent_id) idToTopLevel.set(sub.id, sub.parent_id);
  }

  // Active listings under verified businesses. We only need category_id to
  // count; the !inner join applies the verification filter at the join layer.
  const { data: activeProducts } = await supabase
    .from("products")
    .select("category_id, businesses!inner(verification_status)")
    .eq("status", "active")
    .eq("businesses.verification_status", "verified");

  const counts = new Map<string, number>();
  for (const p of activeProducts ?? []) {
    if (!p.category_id) continue;
    const topId = idToTopLevel.get(p.category_id);
    if (!topId) continue;
    counts.set(topId, (counts.get(topId) ?? 0) + 1);
  }

  const tier1 = topCategories.filter((c) => c.tier === 1);
  const tier2 = topCategories.filter((c) => c.tier === 2);
  const tier3 = topCategories.filter((c) => c.tier === 3);

  return (
    <Container>
      <div className="py-8 sm:py-12">
        <div className="mb-2 text-sm text-ink-600">
          <Link href="/marketplace" className="hover:text-ink">
            ← Marketplace
          </Link>
        </div>
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-2">
          Browse categories
        </h1>
        <p className="text-sm text-ink-600 mb-8">
          Real prices from verified sellers across Nigeria.
        </p>

        {/* Tier 1 — featured grid: 2x3 mobile, 3x2 desktop */}
        <section aria-labelledby="featured-categories" className="mb-10">
          <h2 id="featured-categories" className="sr-only">
            Featured categories
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            {tier1.map((cat) => (
              <CategoryTile
                key={cat.id}
                category={cat}
                count={counts.get(cat.id) ?? 0}
                large
              />
            ))}
          </div>
        </section>

        {/* Tier 2 — secondary row */}
        {tier2.length > 0 && (
          <section aria-labelledby="more-categories" className="mb-10">
            <h2
              id="more-categories"
              className="text-sm font-medium text-ink-600 mb-3 uppercase tracking-wide"
            >
              More to browse
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {tier2.map((cat) => (
                <CategoryTile
                  key={cat.id}
                  category={cat}
                  count={counts.get(cat.id) ?? 0}
                />
              ))}
            </div>
          </section>
        )}

        {/* Tier 3 — expandable drawer */}
        {tier3.length > 0 && (
          <section className="mb-10">
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-ink-600 uppercase tracking-wide list-none flex items-center gap-2 select-none mb-3">
                <span>Other categories</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="transition-transform group-open:rotate-180"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {tier3.map((cat) => (
                  <CategoryTile
                    key={cat.id}
                    category={cat}
                    count={counts.get(cat.id) ?? 0}
                  />
                ))}
              </div>
            </details>
          </section>
        )}
      </div>
    </Container>
  );
}

function CategoryTile({
  category,
  count,
  large = false,
}: {
  category: TopCategory;
  count: number;
  large?: boolean;
}) {
  return (
    <Link href={`/categories/${category.slug}`} className="block">
      <Card variant="hover" className="h-full">
        <div className={large ? "py-2" : ""}>
          <div className={large ? "text-4xl mb-2" : "text-2xl mb-1.5"}>
            {getCategoryEmoji(category.icon_name)}
          </div>
          <p
            className={`font-medium text-ink leading-snug ${
              large ? "text-base" : "text-sm"
            }`}
          >
            {category.name}
          </p>
          <p className="text-xs text-ink-600 mt-0.5">
            {count} {count === 1 ? "listing" : "listings"}
          </p>
        </div>
      </Card>
    </Link>
  );
}
