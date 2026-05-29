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
 * Listing-eligible category denylist (D-140 / 2026-05-29).
 *
 * Inverted from the original Phase E launch-allowlist shape (Sprint 3 /
 * Gap D.4). Per D-140, three verified sellers are now live with referrals
 * coming across multiple categories; most categories are open. A small
 * denylist keeps the categories whose risks are regulatory or safety-shaped
 * (not tier-shaped) closed.
 *
 * The four hard-closes — each shaped by a reason that won't go away when
 * D-116's tiered seller-verification model ships:
 *
 *   - alcohol (`drinks` parent + alcohol subcategories): NAFDAC + Nigerian
 *     state liquor laws require age verification at point of sale; the
 *     platform has no age-gate.
 *   - `health`: NAFDAC tightly regulates pharmaceutical + supplement
 *     sales; there is no regulated-seller verification path on the
 *     platform; counterfeit-drug fraud is a known Nigerian vector.
 *   - `pets`: wildlife-trafficking exposure (Nigerian Endangered Species
 *     Act + CITES species), live-animal welfare moderation, exotic
 *     species scam attractant.
 *   - `services`: categorical misfit — services aren't products, and
 *     "DM for price" is the pain ShowMePrice exists to remove; the
 *     category attracts scams (fake jobs, "investment" opportunities).
 *
 * D-116 originally reserved `vehicles` and `property` for Level 3 / Business
 * Verified (CAC-checked). Per D-140 those are open NOW; the Level 3 tier
 * design remains future work and, if it ships, may layer additional gating
 * on top of (not in place of) this list.
 *
 * LONG-TERM SHAPE: this hardcoded denylist is interim. The eventual home is
 * `categories.category_features` JSONB (the column is already in schema; a
 * flag like `{"phase_e_listable": false}` on each closed row) —
 * admin-toggleable without a code change, per the original deprecation
 * note. When that migration ships, this constant + isLaunchCategory() get
 * deprecated in favour of a data-driven check.
 *
 * Note: this denylist is keyed on category SLUG. `createListingAction` /
 * `updateListingAction` work with category_id (UUID), so they resolve
 * categoryId → slug before calling isLaunchCategory().
 */
export const RESTRICTED_CATEGORY_SLUGS = [
  // Alcohol — NAFDAC + state liquor laws require age verification at sale;
  // platform has no age-gate. Parent `drinks` included to push specificity
  // — non-alcoholic drink subs (`soft-drinks`, `juices`, `water`,
  // `coffee-tea`) remain open via their own slugs.
  "drinks",
  "alcohol-spirits",
  "wine",
  "beer",
  // Health — NAFDAC pharmaceutical regulation; no regulated-seller
  // verification path on the platform; counterfeit-drug fraud is a known
  // Nigerian commerce vector.
  "health",
  // Pets — wildlife-trafficking exposure (CITES + Nigerian Endangered
  // Species Act); live-animal welfare moderation; exotic species scam
  // attractant.
  "pets",
  // Services — services aren't products. "DM for price" is the pattern
  // this platform exists to remove. Fake-job / "investment opportunity"
  // scams cluster here. Revisit if/when a services surface is designed.
  "services",
] as const;

/**
 * True if the given category slug is open for listing — i.e. NOT in the
 * D-140 denylist. Consumed by createListingAction / updateListingAction
 * (Sprint 3 D.2/D.3) to enforce the category restriction server-side.
 *
 * Name kept (vs. e.g. `isListableCategory`) because the two call sites in
 * `src/app/(auth)/actions.ts` already use it; rename is a follow-up.
 */
export function isLaunchCategory(slug: string): boolean {
  return !(RESTRICTED_CATEGORY_SLUGS as readonly string[]).includes(slug);
}
