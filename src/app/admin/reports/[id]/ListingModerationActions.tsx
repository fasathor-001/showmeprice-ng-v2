"use client";

import { Button } from "@/components/ui";
import {
  hideListingAction,
  unhideListingAction,
} from "@/app/admin/reports/actions";

interface Props {
  listingId: string;
  reportId: string;
  /** Non-null = currently admin-hidden, with this timestamp. */
  hiddenAt: string | null;
}

// Stage 2 listing-moderation affordance, rendered on the report detail page
// for target_type='listing' reports. Conditional UI based on the current
// hidden_at value:
//   - hiddenAt === null  → "Hide listing" button (danger variant)
//   - hiddenAt !== null  → "Un-hide listing" button (primary) + when-hidden label
//
// SECURITY: buttons are visibility-only client gates. Real enforcement is in
// actions.ts (requireAdmin) + products_admin_all RLS + products_freeze_hidden_at
// trigger. A crafted POST from a non-admin gets caught at requireAdmin().
//
// Both buttons redirect back to the report detail page so the admin can chain
// into the report-triage actions (e.g., resolve the report after hiding).
export function ListingModerationActions({
  listingId,
  reportId,
  hiddenAt,
}: Props) {
  const hideBound = hideListingAction.bind(null, listingId, reportId);
  const unhideBound = unhideListingAction.bind(null, listingId, reportId);

  if (hiddenAt !== null) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-ink-600">
          Admin-hidden on{" "}
          <span className="font-medium tabular-nums">
            {new Date(hiddenAt).toLocaleString("en-NG")}
          </span>
          . Currently not visible to buyers.
        </p>
        <form action={unhideBound}>
          <Button type="submit" variant="primary" size="md">
            Un-hide listing
          </Button>
        </form>
      </div>
    );
  }

  return (
    <form action={hideBound}>
      <Button type="submit" variant="danger" size="md">
        Hide listing from buyers
      </Button>
    </form>
  );
}
