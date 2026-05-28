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

// ============================================================================
// Stage 2 — listing moderation (hide / un-hide)
// ============================================================================
//
// Migration E.2.13.0 added products.hidden_at + updated the public-read RLS
// on products + product_images to require hidden_at IS NULL + installed the
// products_freeze_hidden_at trigger (admin-only writes enforced at the DB
// layer via is_admin(auth.uid())).
//
// SECURITY — three independent gates, all fail-closed for non-admins:
//   1. App layer: requireAdmin() at the top of each action. Non-admins
//      redirected before any DB call.
//   2. DB layer (RLS): products_admin_all policy on UPDATE — non-admin
//      sessions match zero rows (UPDATE no-ops silently). Defense if app
//      layer is bypassed.
//   3. DB layer (trigger): products_freeze_hidden_at raises 42501 if any
//      non-admin reaches the UPDATE (e.g. a future RLS policy mistake
//      grants broader write).
//
// CLIENT PATTERN: Path A (authenticated client + admin RLS), unlike the
// Stage 1 reports actions (Path B service-role). Matches the verifications
// flow precedent (approveVerificationAction). The choice is RLS-resolved:
// products_admin_all is a known policy that grants admin FOR ALL access,
// so the authenticated client owns the write through RLS.
//
// AUDIT: skipped for Stage 2 (matches existing precedent — verifications,
// reports triage, admin role grants/revokes all skip admin_action_log
// today). The hidden_at timestamp is partial audit: we know WHEN it was
// hidden + only admin RLS + trigger gating could have written it. Consistent
// audit-write coverage across all admin actions is a flagged follow-up.
//
// REVERSIBILITY: un-hide sets hidden_at = NULL, fully restoring public
// visibility (the RLS predicate is `hidden_at IS NULL`).
//
// REDIRECT: both actions redirect to the originating report detail page so
// the admin can chain into the report-triage actions (e.g., resolve the
// report after hiding the listing). reportId is bound by the client.

export async function hideListingAction(
  listingId: string,
  reportId: string,
): Promise<void> {
  // No `reason` parameter at Stage 2 — would clash with React's form-action
  // signature when used via .bind() (the bound action becomes
  // `(_reason?: string) => Promise<void>` which React's <form action={...}>
  // can't consume). When audit coverage ships (flagged follow-up), reason
  // will likely be collected via a separate FormData field on a slightly
  // richer hide UI (e.g., dropdown + free-text), not as an action parameter.
  if (!listingId) redirect("/admin/reports");
  const auth = await requireAdmin();
  if (!auth.ok) {
    redirect(auth.reason === "unauthenticated" ? "/sign-in" : "/dashboard");
  }

  const nowIso = new Date().toISOString();
  // Idempotent: the .is("hidden_at", null) clause means a re-hide of an
  // already-hidden listing is a no-op (won't bump the timestamp). Preserves
  // the original hidden_at as the audit record.
  await auth.supabase
    .from("products")
    .update({ hidden_at: nowIso })
    .eq("id", listingId)
    .is("hidden_at", null);

  redirect(`/admin/reports/${reportId}?toast=listing-hidden`);
}

export async function unhideListingAction(
  listingId: string,
  reportId: string,
): Promise<void> {
  if (!listingId) redirect("/admin/reports");
  const auth = await requireAdmin();
  if (!auth.ok) {
    redirect(auth.reason === "unauthenticated" ? "/sign-in" : "/dashboard");
  }

  // Unconditional set to NULL. If the listing is already visible
  // (hidden_at IS NULL), this is a no-op via the trigger's
  // `OLD.hidden_at IS DISTINCT FROM NEW.hidden_at` guard.
  await auth.supabase
    .from("products")
    .update({ hidden_at: null })
    .eq("id", listingId);

  redirect(`/admin/reports/${reportId}?toast=listing-unhidden`);
}
