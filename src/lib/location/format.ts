// Feature P — shared location formatter for buyer-facing surfaces.
//
// Format contract:
//   - Both present       → "City, State"  (e.g. "Warri, Delta")
//   - State only         → "State"        (e.g. "Delta")
//   - City only          → "City"         (e.g. "Warri") — edge case
//                                           (sellers without a state row)
//   - Neither present    → null           (caller renders nothing)
//
// Callers must handle the `null` return by NOT rendering the location
// element. Don't coerce to empty string at the callsite — that risks
// stranded labels / dot-separators / empty <span>s. Use the value in a
// truthiness gate: `{location && <span>{location}</span>}`.
//
// Two distinct column sources feed this helper across the codebase,
// and they must NOT be merged in any future refactor:
//
//   - businesses.city_area  — where a SELLER operates from. Rendered
//                              on the seller shop page header and
//                              the listing-detail seller card.
//   - products.city_area    — where a LISTING/item is physically
//                              located. Rendered on the listing-detail
//                              badge row and on every ListingCard
//                              across marketplace / category / homepage
//                              / shop / MoreFromSeller surfaces.
//
// A seller in Lagos can publish a listing located in Abuja — these
// columns intentionally differ at the data layer. The formatter is
// agnostic to which column it's reading; the callsite chooses.
//
// Display normalization: `cityArea` is run through `titleCaseCity`
// before composition. The column is free-text at signup so some legacy
// rows are lowercase ("warri") — without normalization those leak into
// every public card and shop header. State names come from the
// `nigerian_states` lookup table and are already canonical, so they
// are NOT passed through any casing helper. The casing helper is
// idempotent — passing already-Title-Cased input is a safe no-op.

/**
 * Title-case a free-text city/area string while preserving whitespace
 * runs (so "lekki phase 1" → "Lekki Phase 1"). Idempotent. Pure
 * display normalization — does not mutate stored data.
 *
 * Exported so any non-formatLocation caller that needs the same
 * display rule can reuse the single source of truth. `formatLocation`
 * below applies this internally to its `cityArea` argument, so a
 * standard display caller does NOT need to wrap manually.
 */
export function titleCaseCity(input: string): string {
  return input
    .toLowerCase()
    .split(/(\s+)/)
    .map((part) =>
      /\s+/.test(part)
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");
}

export function formatLocation(
  cityArea: string | null | undefined,
  stateName: string | null | undefined,
): string | null {
  const city =
    typeof cityArea === "string" && cityArea.length > 0
      ? titleCaseCity(cityArea)
      : null;
  if (!stateName && !city) return null;
  if (!stateName) return city;
  if (!city) return stateName;
  return `${city}, ${stateName}`;
}
