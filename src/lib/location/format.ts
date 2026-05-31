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

export function formatLocation(
  cityArea: string | null | undefined,
  stateName: string | null | undefined,
): string | null {
  if (!stateName && !cityArea) return null;
  if (!stateName) return cityArea ?? null;
  if (!cityArea) return stateName;
  return `${cityArea}, ${stateName}`;
}
