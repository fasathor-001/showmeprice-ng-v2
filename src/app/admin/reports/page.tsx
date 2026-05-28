import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Container } from "@/components/layout";
import { Badge, Card, ToastFromSearchParams } from "@/components/ui";

// Stage 1 admin reports queue (D-134 buyer-reporting completion).
//
// SECURITY: this page uses createAdminClient() which bypasses RLS — therefore
// requireAdmin() is the ONLY barrier between an unauthenticated/non-admin user
// and the full reports table. Per the Stage 1 directive (Path B chosen),
// requireAdmin() guards every report read and every status write — there is
// no ungated path to reports data in this module.
//
// MINIMAL scope (private beta sized): queue shows only open reports
// (status IN 'new'/'in_review'), newest first. Resolved/dismissed reports
// are still in the DB but not surfaced here. No filters, no assignment,
// no notes — that's Stage 2/3+.

export const runtime = "edge";

type OpenReportRow = {
  id: string;
  target_type: "listing" | "user" | "message";
  target_id: string;
  reason: string;
  status: "new" | "in_review";
  created_at: string;
  reporter_id: string;
};

function targetTypeLabel(t: OpenReportRow["target_type"]): string {
  switch (t) {
    case "listing":
      return "Listing";
    case "message":
      return "Message";
    case "user":
      return "User";
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-NG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function ReportsQueuePage() {
  // SECURITY: requireAdmin gate FIRST — before any reports table read.
  const auth = await requireAdmin();
  if (!auth.ok) {
    redirect(
      auth.reason === "unauthenticated"
        ? "/sign-in?next=/admin/reports"
        : "/dashboard"
    );
  }

  // Service-role read — bypasses RLS (intentional; RLS policies on reports
  // are not transcribed and may not include an admin SELECT path).
  const admin = createAdminClient();
  const { data: open } = await admin
    .from("reports")
    .select(
      "id, target_type, target_id, reason, status, created_at, reporter_id"
    )
    .in("status", ["new", "in_review"])
    .order("created_at", { ascending: false });

  const items = (open ?? []) as OpenReportRow[];

  // Fetch reporter display_names in a single batched query (avoids N+1).
  // Two-query approach (not nested-embed) per the K-008 lesson — robust
  // against FK-constraint-name fragility.
  const reporterIds = Array.from(new Set(items.map((r) => r.reporter_id)));
  const { data: reporters } =
    reporterIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, display_name")
          .in("id", reporterIds)
      : { data: [] as { id: string; display_name: string }[] };
  const reporterMap = new Map(
    (reporters ?? []).map((p) => [p.id as string, p.display_name as string])
  );

  return (
    <Container>
      <ToastFromSearchParams />
      <div className="py-8 sm:py-12">
        <div className="mb-4 text-sm text-ink-600">
          <Link href="/admin" className="hover:text-ink">
            ← Admin
          </Link>
        </div>
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-2">
          Reports queue
        </h1>
        <p className="text-sm text-ink-600 mb-8">
          {items.length} open {items.length === 1 ? "report" : "reports"}
        </p>

        {items.length === 0 ? (
          <Card>
            <p className="py-8 text-center text-sm text-ink-600">
              No open reports.
            </p>
          </Card>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/admin/reports/${item.id}`}
                className="block"
              >
                <Card variant="hover">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-medium text-ink-600 uppercase tracking-wide">
                          {targetTypeLabel(item.target_type)}
                        </span>
                        {item.status === "in_review" && (
                          <Badge variant="teal">Reviewing</Badge>
                        )}
                      </div>
                      <p className="text-base font-medium text-ink truncate">
                        {item.reason}
                      </p>
                      <p className="text-xs text-ink-400 mt-1">
                        {reporterMap.get(item.reporter_id) ?? "—"}
                        {" · "}
                        {relativeTime(item.created_at)}
                      </p>
                    </div>
                    {item.status === "new" && (
                      <Badge variant="warning">New</Badge>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}
