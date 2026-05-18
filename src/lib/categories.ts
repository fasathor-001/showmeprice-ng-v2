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

// Phase D.4.1: promoted property + sports from T3, added computer-accessories
// + travel-luggage. Phase D.7.4: replaced food-beverages with two separate
// Tier 2 parents — foodstuff (Nigerian retail vocabulary) and drinks.
// Phase D.7.5: promoted perfume-fragrance to standalone Tier 2 (matches
// Jiji / Jumia / dedicated Nigerian retailer conventions). 10 parents in
// display order.
export const TIER_2_STANDARD_SLUGS = [
  "health",
  "baby-kids",
  "foodstuff",
  "vehicles",
  "property",
  "sports",
  "computer-accessories",
  "travel-luggage",
  "drinks",
  "perfume-fragrance",
] as const;

// Phase D.4.1: -2 (promoted) +7 (new) = 11 parents.
export const TIER_3_MORE_SLUGS = [
  "services",
  "books-media",
  "pets",
  "industrial",
  "office-supplies",
  "tools-hardware",
  "garden-outdoor",
  "musical-instruments",
  "arts-crafts",
  "photography-equipment",
  "religious-items",
] as const;

export type CategoryTier = 1 | 2 | 3;

export function getTierForSlug(slug: string): CategoryTier | null {
  if ((TIER_1_FEATURED_SLUGS as readonly string[]).includes(slug)) return 1;
  if ((TIER_2_STANDARD_SLUGS as readonly string[]).includes(slug)) return 2;
  if ((TIER_3_MORE_SLUGS as readonly string[]).includes(slug)) return 3;
  return null;
}

/**
 * Emoji icons keyed on the category slug. Slug is the canonical identifier
 * used everywhere else in the app — looking up by slug avoids the dead-end
 * `icon_name` column (which was a placeholder for an icon library we never
 * adopted, and is NULL on Phase D.4.1's tier-promotion / new-parent rows).
 *
 * Fallback is a generic tag emoji. Subcategory slugs aren't listed because
 * /categories renders parents only; sub pages don't show an icon.
 */
const CATEGORY_EMOJI: Record<string, string> = {
  // Tier 1
  fashion: "👕",
  "mobile-phones-tablets": "📱",
  "hair-wigs": "💇",
  beauty: "💄",
  electronics: "📺", // Phase D.4.1: was 💻; Laptops moved out to Computer & Accessories
  "home-living": "🛋️",
  // Tier 2
  health: "💊",
  "baby-kids": "👶",
  foodstuff: "🍚",
  drinks: "🥤",
  "perfume-fragrance": "🌹",
  vehicles: "🚗",
  property: "🏠",
  sports: "⚽",
  "computer-accessories": "🖥️",
  "travel-luggage": "🧳",
  // Tier 3
  services: "🛠️",
  "books-media": "📚",
  pets: "🐾",
  industrial: "🏭",
  "office-supplies": "📎",
  "tools-hardware": "🔨",
  "garden-outdoor": "🌱",
  "musical-instruments": "🎸",
  "arts-crafts": "🎨",
  "photography-equipment": "📷",
  "religious-items": "🙏",
};

export function getCategoryEmoji(slug: string | null | undefined): string {
  if (!slug) return "🏷️";
  return CATEGORY_EMOJI[slug] ?? "🏷️";
}
