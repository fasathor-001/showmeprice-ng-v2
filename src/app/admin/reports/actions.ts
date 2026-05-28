"use server";

// Stage 1 admin reports queue — status-transition server actions.
//
// SECURITY (Path B / Stage 1 directive):
//   - All reports table writes here use createAdminClient (service-role,
//     bypasses RLS).
//   - requireAdmin() guards EVERY action. The app-layer admin check is the
//     ONLY barrier between a non-admin user and these writes — no UI-only
//     gating, no implicit RLS protection.
//   - Each action re-reads current state under requireAdmin and refuses
//     stale/invalid transitions (e.g., resolving an already-resolved report
//     redirects without writing).
//
// Status state machine:
//   new → in_review → resolved | dismissed
//   new → resolved | dismissed (skipping in_review is allowed)
//
// Lifecycle timestamps:
//   first_viewed_at  — set on detail-page render (in the page, not here)
//   first_action_at  — set on the first STATUS-changing admin action
//                      (Mark Reviewing / Resolve / Dismiss). COALESCE
//                      semantics: never overwritten if already set.
//   resolved_at      — set on transition to resolved OR dismissed.

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

type ReportStatus = "new" | "in_review" | "resolved" | "dismissed";

interface CurrentReport {
  status: ReportStatus;
  first_action_at: string | null;
}

/**
 * Shared admin gate + current-state read. Returns null if the action should
 * abort with a redirect (the caller does redirect; this helper just signals).
 */
async function gateAndLoadReport(
  reportId: string
): Promise<
  | { ok: true; current: CurrentReport; admin: ReturnType<typeof createAdminClient> }
  | { ok: false; redirectTo: string }
> {
  if (!reportId) {
    return { ok: false, redirectTo: "/admin/reports" };
  }
  // SECURITY: admin check BEFORE any reports access.
  const auth = await requireAdmin();
  if (!auth.ok) {
    return {
      ok: false,
      redirectTo:
        auth.reason === "unauthenticated" ? "/sign-in" : "/dashboard",
    };
  }
  const admin = createAdminClient();
  const { data: current } = await admin
    .from("reports")
    .select("status, first_action_at")
    .eq("id", reportId)
    .maybeSingle();
  if (!current) {
    return { ok: false, redirectTo: "/admin/reports" };
  }
  return { ok: true, current: current as CurrentReport, admin };
}

export async function markReportInReviewAction(
  reportId: string
): Promise<void> {
  const gated = await gateAndLoadReport(reportId);
  if (!gated.ok) redirect(gated.redirectTo);

  // Only meaningful from 'new'. Other states either already-acted-on or
  // already-closed — bail without write.
  if (gated.current.status !== "new") {
    redirect(`/admin/reports/${reportId}`);
  }

  const nowIso = new Date().toISOString();
  await gated.admin
    .from("reports")
    .update({
      status: "in_review",
      first_action_at: gated.current.first_action_at ?? nowIso,
    })
    .eq("id", reportId);

  // Stay on the detail page — admin is still triaging this one.
  redirect(`/admin/reports/${reportId}?toast=report-in-review`);
}

export async function resolveReportAction(reportId: string): Promise<void> {
  const gated = await gateAndLoadReport(reportId);
  if (!gated.ok) redirect(gated.redirectTo);

  // Refuse double-close: if already resolved/dismissed, bounce to queue
  // without writing (preserves the original resolved_at + first_action_at).
  if (
    gated.current.status === "resolved" ||
    gated.current.status === "dismissed"
  ) {
    redirect("/admin/reports");
  }

  const nowIso = new Date().toISOString();
  await gated.admin
    .from("reports")
    .update({
      status: "resolved",
      first_action_at: gated.current.first_action_at ?? nowIso,
      resolved_at: nowIso,
    })
    .eq("id", reportId);

  redirect("/admin/reports?toast=report-resolved");
}

export async function dismissReportAction(reportId: string): Promise<void> {
  const gated = await gateAndLoadReport(reportId);
  if (!gated.ok) redirect(gated.redirectTo);

  if (
    gated.current.status === "resolved" ||
    gated.current.status === "dismissed"
  ) {
    redirect("/admin/reports");
  }

  const nowIso = new Date().toISOString();
  await gated.admin
    .from("reports")
    .update({
      status: "dismissed",
      first_action_at: gated.current.first_action_at ?? nowIso,
      resolved_at: nowIso,
    })
    .eq("id", reportId);

  redirect("/admin/reports?toast=report-dismissed");
}
