import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Card } from "@/components/ui";
import { getCategoryEmoji } from "@/lib/categories";

/**
 * Browse-by-category quick-access grid on the home page. Surfaces the 7
 * Tier 1 (featured) parents (6 from Phase D + power-generators from
 * Sprint 3 / Gap D.0a). Data-driven: queries tier=1 parents ordered by
 * sort_order, so new featured categories appear automatically. Each card
 * links to /categories/[slug] (parent rolls up its subcategory listings).
 */
export async function PopularCategories() {
  const supabase = createClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, slug")
    .is("parent_id", null)
    .eq("tier", 1)
    .order("sort_order", { ascending: true });

  const items = categories ?? [];

  return (
    <section className="py-10 sm:py-14 bg-white">
      <Container>
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-lg sm:text-xl font-medium text-ink">
            Browse by category
          </h2>
          <Link
            href="/categories"
            className="text-sm text-teal-700 hover:text-teal-900"
          >
            All categories →
          </Link>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {/* On mobile (<sm) show only the first 3 — desktop unchanged. The
              remaining items stay in the DOM but are display:none on mobile
              via Tailwind's `hidden sm:block`. Mobile users still reach the
              rest via the "All categories →" link above. Display:none also
              removes the hidden items from the accessibility tree, so this
              isn't a screen-reader regression. K-068 tracks the eventual
              marquee upgrade at full launch. */}
          {items.map((cat, idx) => (
            <Link
              key={cat.id}
              href={`/categories/${cat.slug}`}
              className={`block ${idx >= 3 ? "hidden sm:block" : ""}`}
            >
              <Card variant="hover" className="h-full text-center">
                <div className="text-3xl mb-1.5">
                  {getCategoryEmoji(cat.slug)}
                </div>
                <p className="text-sm font-medium text-ink leading-snug">
                  {cat.name}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
