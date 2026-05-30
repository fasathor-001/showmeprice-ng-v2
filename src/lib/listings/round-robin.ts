// E.2.x — round-robin seller-diversity helper.
//
// D-144 originally landed this function inline in
// src/components/home/FeaturedListings.tsx (commit 207da1d). Extracted
// here as the canonical location once a second surface (the category
// browse page, /categories/[slug]) needed the same pattern. Future
// surfaces (e.g. /categories/[slug] subcategory rollups, future
// "popular sellers" rails) import from this lib module.
//
// The function is pure — no React, no I/O, no module state. Testable
// in isolation. Generic over any row shape that carries seller_id +
// created_at (ISO 8601 timestamp string).

/**
 * Round-robin pick across sellers. Takes the over-fetched rows and
 * returns at most `limit` rows distributed fairly: newest from seller A,
 * then newest from seller B, then newest from seller C, then 2nd-newest
 * from A, B, C, etc. Stops when `limit` is reached OR all groups are
 * exhausted.
 *
 * Seller ordering within each round = most-recently-active seller first
 * (the seller whose newest listing is most recent gets the first slot).
 * This is what makes a freshly-onboarded seller's first listing surface
 * immediately instead of being buried under an older-but-prolific
 * seller's stream.
 *
 * Pure function — no React, no I/O, no module state. Testable in isolation.
 *
 * Sparse-supply behavior: at today's exact state (2 sellers, 9 listings,
 * 8 from one), output is [other-seller's 1, fashion #1, fashion #2,
 * fashion #3, fashion #4, fashion #5, fashion #6, fashion #7] — the 1st
 * card is guaranteed to come from a different seller than the rest, so
 * the homepage no longer reads as 100% one seller. As supply grows past
 * 2 sellers the diversity improves automatically without code change.
 */
export function roundRobinBySeller<
  T extends { seller_id: string; created_at: string },
>(rows: T[], limit: number): T[] {
  if (limit <= 0 || rows.length === 0) return [];

  // Group by seller. Insertion order doesn't matter — we sort below.
  const bySeller = new Map<string, T[]>();
  for (const row of rows) {
    const arr = bySeller.get(row.seller_id) ?? [];
    arr.push(row);
    bySeller.set(row.seller_id, arr);
  }

  // Within each seller's group, newest first. ISO 8601 timestamp strings
  // sort lexicographically === chronologically, so string compare is safe.
  // Array.from over .values() avoids the MapIterator-spread limitation
  // under the codebase's TS target.
  const sellerGroups: T[][] = Array.from(bySeller.values());
  for (const arr of sellerGroups) {
    arr.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  // Order sellers by their newest listing's created_at DESC. Seller whose
  // newest listing is most recent gets first slot in every round.
  const sellersOrdered = sellerGroups.sort((a, b) =>
    b[0].created_at.localeCompare(a[0].created_at),
  );

  // Round-robin: round r picks index r from each seller (if they have
  // that many). Stop on limit OR when no group had a row in this round.
  const result: T[] = [];
  for (let round = 0; result.length < limit; round++) {
    let pickedThisRound = false;
    for (const sellerGroup of sellersOrdered) {
      if (round < sellerGroup.length) {
        result.push(sellerGroup[round]);
        pickedThisRound = true;
        if (result.length >= limit) return result;
      }
    }
    if (!pickedThisRound) break;
  }
  return result;
}
