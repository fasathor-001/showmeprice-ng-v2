import type { SupabaseClient } from "@supabase/supabase-js";

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
 * Buyer-friendly labels for states where the commerce-hub city name reads
 * more naturally than the state name (Phase D.6.1 chip mapping). Unmapped
 * states fall back to the state name in {@link getStateLabel}.
 */
export const STATE_CITY_LABELS: Record<string, string> = {
  lagos: "Lagos",
  abuja: "Abuja",
  rivers: "Port Harcourt",
  delta: "Warri",
  oyo: "Ibadan",
  enugu: "Enugu",
  kaduna: "Kaduna",
  anambra: "Onitsha",
  kano: "Kano",
};

export function getStateLabel(stateSlug: string, stateName: string): string {
  return STATE_CITY_LABELS[stateSlug] ?? stateName;
}

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

// -- Dynamic chip ordering (Phase D.6.2) -------------------------------------
//
// The Hero shows up to 9 quick-pick city chips. We want them ordered by
// actual listing density so the most-trafficked locations surface first; if
// listings are sparse we pad with the FEATURED_STATE_SLUGS fallback order to
// keep the row from collapsing.

/**
 * Aggregate of verified-active listing counts keyed on state slug. Read-time
 * aggregation — fine while data is small. If counts get expensive we can
 * promote to a Postgres function or materialised view.
 */
export async function getListingCountsByState(
  supabase: SupabaseClient
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("products")
    .select(
      `
      state_id,
      nigerian_states ( slug ),
      businesses!inner ( verification_status )
    `
    )
    .eq("status", "active")
    .eq("businesses.verification_status", "verified");

  if (error || !data) return {};

  const counts: Record<string, number> = {};
  for (const row of data as Array<{
    nigerian_states: { slug: string } | { slug: string }[] | null;
  }>) {
    const ns = Array.isArray(row.nigerian_states)
      ? row.nigerian_states[0]
      : row.nigerian_states;
    const slug = ns?.slug;
    if (slug) counts[slug] = (counts[slug] ?? 0) + 1;
  }
  return counts;
}

/**
 * Returns up to 9 city chips ordered by:
 *   1. Verified-active listing count (desc)
 *   2. FEATURED_STATE_SLUGS order (tiebreaker for equal counts; both in list)
 *   3. Alphabetical state name (final fallback)
 *
 * If fewer than 9 states have any listings, the result is padded from the
 * featured fallback so the chip row stays full from day one.
 */
export async function getFeaturedCityChips(
  supabase: SupabaseClient,
  states: { slug: string; name: string }[]
): Promise<Array<{ label: string; stateSlug: string }>> {
  const counts = await getListingCountsByState(supabase);

  const fallbackOrder = FEATURED_STATE_SLUGS as readonly string[];

  const ranked = states
    .map((s) => ({
      slug: s.slug,
      name: s.name,
      count: counts[s.slug] ?? 0,
    }))
    .filter((s) => s.count > 0)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const aIdx = fallbackOrder.indexOf(a.slug);
      const bIdx = fallbackOrder.indexOf(b.slug);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

  const chips: Array<{ label: string; stateSlug: string }> = ranked
    .slice(0, 9)
    .map((s) => ({ label: getStateLabel(s.slug, s.name), stateSlug: s.slug }));

  if (chips.length < 9) {
    const used = new Set(chips.map((c) => c.stateSlug));
    for (const slug of fallbackOrder) {
      if (chips.length >= 9) break;
      if (used.has(slug)) continue;
      const state = states.find((s) => s.slug === slug);
      if (!state) continue;
      chips.push({
        label: getStateLabel(slug, state.name),
        stateSlug: slug,
      });
    }
  }

  return chips;
}
