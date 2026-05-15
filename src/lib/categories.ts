/**
 * Category tier registry. The canonical tier classification lives on
 * categories.tier in the database (1/2/3 integer column added in Phase D
 * P-migration). These slug arrays are the application-side mirror — used
 * for:
 *
 *   - Compile-time type narrowing on known slugs
 *   - Quick membership checks without a DB roundtrip
 *   - Documentation: this file is the readable inventory of what's
 *     featured vs in-nav vs in-the-more-drawer
 *
 * Keep this file in sync with the categories.tier column. If you change
 * the tier of a slug here, also UPDATE the DB row, and vice versa.
 */

export const TIER_1_FEATURED_SLUGS = [
  "fashion",
  "mobile-phones-tablets",
  "hair-wigs",
  "beauty",
  "electronics",
  "home-living",
] as const;

export const TIER_2_STANDARD_SLUGS = [
  "health",
  "baby-kids",
  "food-beverages",
  "vehicles",
] as const;

export const TIER_3_MORE_SLUGS = [
  "property",
  "services",
  "sports",
  "books-media",
  "pets",
  "industrial",
] as const;

export type CategoryTier = 1 | 2 | 3;

export function getTierForSlug(slug: string): CategoryTier | null {
  if ((TIER_1_FEATURED_SLUGS as readonly string[]).includes(slug)) return 1;
  if ((TIER_2_STANDARD_SLUGS as readonly string[]).includes(slug)) return 2;
  if ((TIER_3_MORE_SLUGS as readonly string[]).includes(slug)) return 3;
  return null;
}

/**
 * Emoji icons keyed on categories.icon_name (the lucide-react-style names
 * the Phase D seed populates). Kept here rather than in the categories
 * table so we don't have to migrate every time we tweak an icon. Fallback
 * is a generic tag emoji.
 */
const CATEGORY_EMOJI: Record<string, string> = {
  shirt: "👕",
  smartphone: "📱",
  scissors: "💇",
  sparkles: "💄",
  cpu: "💻",
  home: "🛋️",
  "heart-pulse": "💊",
  baby: "👶",
  utensils: "🍽️",
  car: "🚗",
  building: "🏢",
  wrench: "🔧",
  dumbbell: "🏋️",
  "book-open": "📚",
  "paw-print": "🐾",
  factory: "🏭",
};

export function getCategoryEmoji(iconName: string | null | undefined): string {
  if (!iconName) return "🏷️";
  return CATEGORY_EMOJI[iconName] ?? "🏷️";
}
