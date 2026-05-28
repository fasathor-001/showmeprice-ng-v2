"use client";

import { Button } from "@/components/ui";
import {
  markReportInReviewAction,
  resolveReportAction,
  dismissReportAction,
} from "@/app/admin/reports/actions";

interface Props {
  reportId: string;
  status: "new" | "in_review" | "resolved" | "dismissed";
}

// Status-transition buttons for the report detail view. Mirrors the shape
// of /admin/verifications/[id]/ReviewActions: each button is a tiny form
// posting to a server action with reportId bound via .bind(null, ...).
//
// SECURITY: the buttons are visibility-gated client-side (don't render
// Resolve/Dismiss when status is already terminal), but the actual security
// is the requireAdmin() + double-transition guard inside the server actions.
// A crafted POST against a closed report still gets rejected and redirected
// to /admin/reports without a DB write.
export function ReportTriageActions({ reportId, status }: Props) {
  if (status === "resolved" || status === "dismissed") {
    return null;
  }

  const inReviewBound = markReportInReviewAction.bind(null, reportId);
  const resolveBound = resolveReportAction.bind(null, reportId);
  const dismissBound = dismissReportAction.bind(null, reportId);

  return (
    <div className="flex gap-3 flex-wrap">
      {status === "new" && (
        <form action={inReviewBound}>
          <Button type="submit" variant="ghost" size="lg">
            Mark Reviewing
          </Button>
        </form>
      )}
      <form action={resolveBound}>
        <Button type="submit" variant="primary" size="lg">
          Resolve
        </Button>
      </form>
      <form action={dismissBound}>
        <Button type="submit" variant="ghost" size="lg">
          Dismiss
        </Button>
      </form>
    </div>
  );
}
