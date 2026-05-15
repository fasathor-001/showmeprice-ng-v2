/**
 * Featured state ordering for dropdowns and filters.
 *
 * The 9 slugs listed here surface first in the order shown; remaining states
 * appear alphabetically afterwards. This matches nigerian_states.slug values
 * seeded via the Phase D P-migration (`lower(replace(name, ' ', '-'))` with
 * cleanups for FCT/Abuja, Akwa Ibom, Cross River).
 *
 * D-043: Lagos, Abuja, Rivers represent ~65% of Nigerian e-commerce; the
 * remaining six add Southwest, South-South, Southeast, and Northern coverage.
 */

export const FEATURED_STATE_SLUGS = [
  "lagos",
  "abuja",
  "rivers",
  "delta",
  "oyo",
  "enugu",
  "kaduna",
  "anambra",
  "kano",
] as const;

/**
 * Sort an array of states with featured slugs first (in FEATURED_STATE_SLUGS
 * order) and the rest alphabetically by name. Pure: never mutates the input
 * (`.filter()` returns a new array; the spread before sort is implicit since
 * filter already returned a fresh array).
 */
export function sortStatesByFeatured<T extends { slug: string; name: string }>(
  states: T[]
): T[] {
  const featuredOrder = FEATURED_STATE_SLUGS as readonly string[];
  const featured = states
    .filter((s) => featuredOrder.includes(s.slug))
    .sort(
      (a, b) => featuredOrder.indexOf(a.slug) - featuredOrder.indexOf(b.slug)
    );
  const rest = states
    .filter((s) => !featuredOrder.includes(s.slug))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...featured, ...rest];
}

export function isFeaturedStateSlug(slug: string): boolean {
  return (FEATURED_STATE_SLUGS as readonly string[]).includes(slug);
}
