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
  // Sprint 3 / Gap D.0a: strategic NG launch category (chronic power
  // instability makes generators/inverters/solar/batteries household
  // infrastructure). Appended at sort_order 7 — 7th featured tile.
  "power-generators",
] as const;

// Phase D.4.1: promoted property + sports from T3, added computer-accessories
// + travel-luggage. Phase D.7.4: replaced food-beverages with two separate
// Tier 2 parents — foodstuff (Nigerian retail vocabulary) and drinks.
// Phase D.7.5: promoted perfume-fragrance to standalone Tier 2 (matches
// Jiji / Jumia / dedicated Nigerian retailer conventions).
// Phase D.7.6: added building-materials (Jiji.ng has 52,165+ active
// building-materials listings — major Nigerian commerce vertical).
// 11 parents in display order.
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
  "building-materials",
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
  "power-generators": "⚡", // Sprint 3 / Gap D.0a — Tier 1 launch category
  // Tier 2
  health: "💊",
  "baby-kids": "👶",
  foodstuff: "🍚",
  drinks: "🥤",
  "perfume-fragrance": "🌹",
  "building-materials": "🧱",
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

/**
 * Phase E launch-category allowlist (Sprint 3 / Gap D.4).
 *
 * Listing creation in Phase E is restricted to these category slugs —
 * the trust-product focus categories. The 5 launch category *types*:
 *   - phones        → mobile-phones-tablets tree
 *   - computers     → computer-accessories tree (laptops launch focus,
 *                     broadened to the full tree: desktops, monitors, etc.)
 *   - electronics   → electronics tree (also the listing home for
 *                     appliances, which are discoverable via the appliance
 *                     search_aliases added to `electronics` in Gap D.0b)
 *   - power/gen     → power-generators tree (seeded in Gap D.0a)
 *
 * 20 slugs across 4 category trees. Source of truth: the D.0a seed
 * migration + the existing taxonomy in src/db/seed.ts.
 *
 * DEPRECATION PATH: Phase F+ replaces this hardcoded constant with an
 * admin-toggleable `categories.category_features` JSONB flag (e.g.
 * `{"phase_e_launch": true}`), so the launchable set can expand without a
 * code change as new seller categories onboard. When that migration ships,
 * this constant + isLaunchCategory() get deprecated in favour of a
 * data-driven check. Until then, this is the Phase E enforcement surface.
 *
 * Note: this allowlist is keyed on category SLUG. `createListingAction` /
 * `updateListingAction` work with category_id (UUID), so the D.2/D.3
 * patches must resolve categoryId → slug before calling isLaunchCategory().
 */
export const LAUNCH_CATEGORY_SLUGS = [
  // phones (mobile-phones-tablets tree)
  "mobile-phones-tablets",
  "smartphones-new",
  "smartphones-used",
  "tablets",
  "phone-accessories",
  "smart-wearables",
  // electronics (covers appliances via search_aliases — Gap D.0b)
  "electronics",
  "electronics-accessories",
  // computers (full computer-accessories tree)
  "computer-accessories",
  "laptops",
  "desktops-workstations",
  "monitors",
  "keyboards-mice",
  "storage-drives",
  "computer-accessories-misc",
  // power & generators (seeded by Gap D.0a)
  "power-generators",
  "generators",
  "inverters",
  "solar-panels",
  "batteries",
] as const;

/**
 * True if the given category slug is in the Phase E launch allowlist.
 * Consumed by createListingAction / updateListingAction (D.2/D.3) to
 * enforce the Phase E category restriction server-side.
 */
export function isLaunchCategory(slug: string): boolean {
  return (LAUNCH_CATEGORY_SLUGS as readonly string[]).includes(slug);
}
