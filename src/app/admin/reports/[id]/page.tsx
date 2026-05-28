import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Container } from "@/components/layout";
import { Badge, Card, ToastFromSearchParams } from "@/components/ui";
import { ReportTriageActions } from "./ReportTriageActions";
import { formatNigerianPhone } from "@/lib/auth";

// Stage 1 admin report detail (D-134 buyer-reporting completion).
//
// SECURITY: createAdminClient (service-role) for all reports/target reads
// + first_viewed_at write. requireAdmin() guards the page render before any
// reports access. The triage actions component is purely a UI affordance —
// real security is in actions.ts (also requireAdmin-guarded).
//
// MINIMAL scope: shows the report (reason, description, status timestamps),
// the reporter (display_name), and the target context (listing title +
// link, message content snippet, or user reference). No moderation actions
// against the target — that's Stage 2.

export const runtime = "edge";

type ReportRow = {
  id: string;
  reporter_id: string;
  target_type: "listing" | "user" | "message";
  target_id: string;
  reason: string;
  description: string | null;
  status: "new" | "in_review" | "resolved" | "dismissed";
  created_at: string;
  first_viewed_at: string | null;
  first_action_at: string | null;
  resolved_at: string | null;
};

type ListingTarget = {
  kind: "listing";
  id: string;
  title: string;
  slug: string | null;
  price_kobo: number | null;
  status: string;
  seller_id: string;
};
type MessageTarget = {
  kind: "message";
  id: string;
  content: string | null;
  message_type: string;
  sender_id: string;
  conversation_id: string;
  created_at: string;
};
type UserTarget = {
  kind: "user";
  id: string;
  display_name: string;
  phone: string;
};
type MissingTarget = { kind: "missing"; target_type: ReportRow["target_type"] };

type TargetContext = ListingTarget | MessageTarget | UserTarget | MissingTarget;

function statusBadge(status: ReportRow["status"]) {
  switch (status) {
    case "new":
      return <Badge variant="warning">New</Badge>;
    case "in_review":
      return <Badge variant="teal">Reviewing</Badge>;
    case "resolved":
      return <Badge variant="verified">Resolved</Badge>;
    case "dismissed":
      return <Badge variant="neutral">Dismissed</Badge>;
  }
}

function targetTypeLabel(t: ReportRow["target_type"]): string {
  switch (t) {
    case "listing":
      return "Listing";
    case "message":
      return "Message";
    case "user":
      return "User";
  }
}

function formatPrice(kobo: number | null): string {
  if (kobo === null) return "—";
  const naira = kobo / 100;
  return `₦${naira.toLocaleString("en-NG")}`;
}

export default async function ReportDetailPage({
  params,
}: {
  params: { id: string };
}) {
  // SECURITY: admin gate FIRST.
  const auth = await requireAdmin();
  if (!auth.ok) {
    redirect(
      auth.reason === "unauthenticated"
        ? `/sign-in?next=/admin/reports/${params.id}`
        : "/dashboard"
    );
  }

  const admin = createAdminClient();

  const { data: reportRaw } = await admin
    .from("reports")
    .select(
      "id, reporter_id, target_type, target_id, reason, description, status, created_at, first_viewed_at, first_action_at, resolved_at"
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!reportRaw) notFound();
  const report = reportRaw as ReportRow;

  // Idempotent first-view stamp. Conditional update only flips the column
  // when it's still NULL; concurrent admin views race-safely (whoever lands
  // first wins; the others' UPDATE matches zero rows and no-ops). The
  // result isn't read back for display — keeps the page render simple.
  if (!report.first_viewed_at) {
    await admin
      .from("reports")
      .update({ first_viewed_at: new Date().toISOString() })
      .eq("id", report.id)
      .is("first_viewed_at", null);
  }

  // Reporter context.
  const { data: reporterRaw } = await admin
    .from("profiles")
    .select("display_name, phone")
    .eq("id", report.reporter_id)
    .maybeSingle();
  const reporter = reporterRaw as { display_name: string; phone: string } | null;

  // Target context — branch on target_type. Each branch fetches the minimum
  // needed for the admin to understand WHAT was reported. No deep moderation
  // affordances here (that's Stage 2).
  let targetContext: TargetContext;
  if (report.target_type === "listing") {
    const { data } = await admin
      .from("products")
      .select("id, title, slug, price_kobo, status, seller_id")
      .eq("id", report.target_id)
      .maybeSingle();
    targetContext = data
      ? {
          kind: "listing",
          id: data.id as string,
          title: data.title as string,
          slug: (data.slug as string) ?? null,
          price_kobo: (data.price_kobo as number) ?? null,
          status: data.status as string,
          seller_id: data.seller_id as string,
        }
      : { kind: "missing", target_type: "listing" };
  } else if (report.target_type === "message") {
    const { data } = await admin
      .from("messages")
      .select(
        "id, content, message_type, sender_id, conversation_id, created_at"
      )
      .eq("id", report.target_id)
      .maybeSingle();
    targetContext = data
      ? {
          kind: "message",
          id: data.id as string,
          content: (data.content as string) ?? null,
          message_type: data.message_type as string,
          sender_id: data.sender_id as string,
          conversation_id: data.conversation_id as string,
          created_at: data.created_at as string,
        }
      : { kind: "missing", target_type: "message" };
  } else {
    // target_type === 'user'
    const { data } = await admin
      .from("profiles")
      .select("id, display_name, phone")
      .eq("id", report.target_id)
      .maybeSingle();
    targetContext = data
      ? {
          kind: "user",
          id: data.id as string,
          display_name: data.display_name as string,
          phone: data.phone as string,
        }
      : { kind: "missing", target_type: "user" };
  }

  return (
    <Container>
      <ToastFromSearchParams />
      <div className="py-8 sm:py-12 max-w-3xl mx-auto">
        <div className="mb-4 text-sm text-ink-600">
          <Link href="/admin/reports" className="hover:text-ink">
            ← Queue
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-medium text-ink">
            {targetTypeLabel(report.target_type)} report
          </h1>
          {statusBadge(report.status)}
        </div>
        <p className="text-sm text-ink-600 mb-8">
          Filed {new Date(report.created_at).toLocaleString("en-NG")}
        </p>

        {/* Report content */}
        <Card className="mb-4">
          <h2 className="text-sm font-medium text-ink mb-3">Report</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-ink-600 text-xs">Reason</dt>
              <dd className="text-ink">{report.reason}</dd>
            </div>
            {report.description && (
              <div>
                <dt className="text-ink-600 text-xs">Description</dt>
                <dd className="text-ink whitespace-pre-line">
                  {report.description}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-ink-600 text-xs">Reporter</dt>
              <dd className="text-ink">
                {reporter?.display_name ?? "—"}
                {reporter?.phone && (
                  <span className="text-ink-600 text-xs ml-2 tabular-nums">
                    {formatNigerianPhone(reporter.phone)}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        {/* Target context */}
        <Card className="mb-4">
          <h2 className="text-sm font-medium text-ink mb-3">
            {targetTypeLabel(report.target_type)} reported
          </h2>

          {targetContext.kind === "missing" && (
            <p className="text-sm text-ink-600">
              The reported {targetTypeLabel(targetContext.target_type).toLowerCase()}{" "}
              no longer exists (target_id:{" "}
              <span className="font-mono text-xs">{report.target_id}</span>).
            </p>
          )}

          {targetContext.kind === "listing" && (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-ink-600 text-xs">Title</dt>
                <dd className="text-ink">{targetContext.title}</dd>
              </div>
              <div>
                <dt className="text-ink-600 text-xs">Price</dt>
                <dd className="text-ink">
                  {formatPrice(targetContext.price_kobo)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-600 text-xs">Listing status</dt>
                <dd className="text-ink">{targetContext.status}</dd>
              </div>
              <div>
                <dt className="text-ink-600 text-xs">Open listing</dt>
                <dd>
                  <Link
                    href={`/listings/${targetContext.id}`}
                    className="text-teal-700 hover:text-teal-900 underline text-sm"
                  >
                    View on marketplace →
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-ink-600 text-xs">Seller (profile id)</dt>
                <dd className="text-ink font-mono text-xs">
                  {targetContext.seller_id}
                </dd>
              </div>
            </dl>
          )}

          {targetContext.kind === "message" && (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-ink-600 text-xs">Type</dt>
                <dd className="text-ink">{targetContext.message_type}</dd>
              </div>
              {targetContext.content && (
                <div>
                  <dt className="text-ink-600 text-xs">Content</dt>
                  <dd className="text-ink whitespace-pre-line bg-neutral-50 border border-neutral-200 rounded-md px-3 py-2">
                    {targetContext.content}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-ink-600 text-xs">Sent</dt>
                <dd className="text-ink">
                  {new Date(targetContext.created_at).toLocaleString("en-NG")}
                </dd>
              </div>
              <div>
                <dt className="text-ink-600 text-xs">Sender (profile id)</dt>
                <dd className="text-ink font-mono text-xs">
                  {targetContext.sender_id}
                </dd>
              </div>
              <div>
                <dt className="text-ink-600 text-xs">Conversation id</dt>
                <dd className="text-ink font-mono text-xs">
                  {targetContext.conversation_id}
                </dd>
              </div>
            </dl>
          )}

          {targetContext.kind === "user" && (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-ink-600 text-xs">Display name</dt>
                <dd className="text-ink">{targetContext.display_name}</dd>
              </div>
              <div>
                <dt className="text-ink-600 text-xs">Phone</dt>
                <dd className="text-ink tabular-nums">
                  {formatNigerianPhone(targetContext.phone)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-600 text-xs">Profile id</dt>
                <dd className="text-ink font-mono text-xs">
                  {targetContext.id}
                </dd>
              </div>
            </dl>
          )}
        </Card>

        {/* Lifecycle (minimal — useful for audit, not actionable here) */}
        <Card className="mb-8">
          <h2 className="text-sm font-medium text-ink mb-3">Lifecycle</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-600 text-xs">Filed</dt>
              <dd className="text-ink text-xs">
                {new Date(report.created_at).toLocaleString("en-NG")}
              </dd>
            </div>
            {report.first_viewed_at && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-600 text-xs">First viewed</dt>
                <dd className="text-ink text-xs">
                  {new Date(report.first_viewed_at).toLocaleString("en-NG")}
                </dd>
              </div>
            )}
            {report.first_action_at && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-600 text-xs">First action</dt>
                <dd className="text-ink text-xs">
                  {new Date(report.first_action_at).toLocaleString("en-NG")}
                </dd>
              </div>
            )}
            {report.resolved_at && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-600 text-xs">Closed</dt>
                <dd className="text-ink text-xs">
                  {new Date(report.resolved_at).toLocaleString("en-NG")}
                </dd>
              </div>
            )}
          </dl>
        </Card>

        {/* Triage controls (no-op when status is already terminal) */}
        <ReportTriageActions reportId={report.id} status={report.status} />
      </div>
    </Container>
  );
}
