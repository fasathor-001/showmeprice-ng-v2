// D-157 / launch geographic focus — single source of truth for the states
// ShowMePrice presents to buyers and accepts from sellers during the private
// beta. Every state selector + filter consumes this list; expanding to more
// markets later is a ONE-LINE config edit, not a multi-file sweep.
//
// Slugs match nigerian_states.slug (NOT names). The FCT state row uses slug
// "abuja" (display label "Abuja") per src/db/seed.ts:38 — we identify it by
// its existing slug rather than introducing a separate "fct" alias, which
// would require a data migration. Display labels stay buyer-friendly via the
// existing STATE_CITY_LABELS map in src/lib/states.ts ("Abuja", "Port
// Harcourt", "Warri", "Lagos").
//
// Surfaces that consume this:
//   - Hero homepage state dropdown + chips (src/components/home/Hero.tsx)
//   - Marketplace state filter + implicit-all listings query
//     (src/app/marketplace/page.tsx)
//   - Category state filter + implicit-all listings query
//     (src/app/categories/[slug]/page.tsx)
//   - Seller signup state dropdown (src/app/(auth)/sign-up/page.tsx)
//   - Buyer→seller conversion state dropdown (src/app/sell/page.tsx)
//   - New listing state dropdown (src/app/listings/new/page.tsx)
//   - Edit listing state dropdown (src/app/listings/[id]/edit/page.tsx)
//     — see EDIT-STICKY note below.
//   - Server-side defense-in-depth validation on signUpAction,
//     becomeSellerAction, createListingAction, updateListingAction.
//
// EXPLICITLY NOT consumed by (full state list preserved):
//   - /sell/verify ID-address dropdown (NIN home address — must accept any
//     state).
//   - Admin Change-Location dropdown (admin needs full control).
//
// EDIT-STICKY exception: when editing an existing listing whose state_id is
// no longer in the launch set, the edit-listing page MUST include that
// historical state as a sticky option so editing other fields never silently
// relocates the listing. The corresponding action (updateListingAction)
// validates against (launch states ∪ {listing's current state_id}). See the
// per-action comments for the enforcement.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Launch states by slug. Matches nigerian_states.slug values verbatim.
 * NOTE: "abuja" is the slug for the Federal Capital Territory row (per
 * src/db/seed.ts:38). State NAMES surfaced to buyers come from the
 * STATE_CITY_LABELS map in src/lib/states.ts ("Abuja" / "Port Harcourt").
 */
export const LAUNCH_STATE_SLUGS = [
  "lagos",
  "abuja",
  "rivers",
  "delta",
] as const;

export type LaunchStateSlug = (typeof LAUNCH_STATE_SLUGS)[number];

export function isLaunchStateSlug(slug: string): boolean {
  return (LAUNCH_STATE_SLUGS as readonly string[]).includes(slug);
}

/**
 * Filter a queried states array to only launch states. Pure — does not
 * mutate the input. Caller must include `slug` in the underlying select.
 */
export function filterToLaunchStates<T extends { slug: string }>(
  states: T[],
): T[] {
  return states.filter((s) => isLaunchStateSlug(s.slug));
}

/**
 * Resolve launch-state IDs from a queried states array. Useful for the
 * marketplace/category implicit-all `.in("state_id", launchStateIds(...))`
 * filter.
 */
export function launchStateIds<T extends { id: string; slug: string }>(
  states: T[],
): string[] {
  return filterToLaunchStates(states).map((s) => s.id);
}

/**
 * Buyer-facing "all" option label. Replaces "All Nigeria" / "All states"
 * on the homepage, marketplace, and category state filters per D-157.
 */
export const LAUNCH_LOCATIONS_LABEL = "All launch locations";

/**
 * Fixed-order homepage quick-pick chip set. Order, labels, and slugs are
 * authoritative here — replaces the dynamic listing-count-sorted chips
 * previously produced by getFeaturedCityChips. Labels are state-level
 * ("Delta" / "Rivers") rather than the city-labels in STATE_CITY_LABELS
 * ("Warri" / "Port Harcourt"); "Abuja" stays as the recognizable name
 * for the FCT/slug=abuja since buyers search "Abuja", not "FCT".
 *
 * Single source of truth: expanding launch markets later means adding
 * one entry here AND one slug to LAUNCH_STATE_SLUGS above — both edits
 * land in this file.
 */
export const LAUNCH_LOCATION_CHIPS = [
  { label: "Lagos", slug: "lagos" },
  { label: "Abuja", slug: "abuja" },
  { label: "Delta", slug: "delta" },
  { label: "Rivers", slug: "rivers" },
] as const;

/**
 * Warm copy for surfaces that need to explain why a seller's state isn't
 * available yet. Reserved for future use; no current consumer renders it
 * directly (the form dropdowns simply omit non-launch states).
 */
export const UNSUPPORTED_STATE_MESSAGE =
  "ShowMePrice is currently onboarding sellers in Lagos, Abuja, Port Harcourt, and Delta for private beta. We are expanding to more states soon.";

/**
 * Server-side guard: confirm a state_id resolves to one of the launch
 * states. Looks up the state's slug via nigerian_states and checks
 * membership against LAUNCH_STATE_SLUGS.
 *
 * Returns `true` when the id is a launch state, `false` otherwise
 * (including when the id is unknown / malformed).
 *
 * Used as defense in depth in server actions (signUpAction,
 * becomeSellerAction, createListingAction, updateListingAction). The form
 * dropdowns only present launch states, but a tampered client could
 * submit any uuid as `stateId` / `businessStateId`. This guard rejects.
 *
 * EDIT EXCEPTION: updateListingAction additionally allows the listing's
 * current state_id even if not in launch states (per the build-time
 * sticky-state decision). Callers that need that exception should
 * short-circuit BEFORE calling this guard when `newStateId === currentStateId`.
 */
export async function isLaunchStateId(
  supabase: SupabaseClient,
  stateId: string,
): Promise<boolean> {
  if (!stateId) return false;
  const { data } = await supabase
    .from("nigerian_states")
    .select("slug")
    .eq("id", stateId)
    .maybeSingle();
  const slug = (data as { slug?: string } | null)?.slug;
  if (!slug) return false;
  return isLaunchStateSlug(slug);
}
