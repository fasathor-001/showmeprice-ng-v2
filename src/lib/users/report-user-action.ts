"use server";

// Feature K — user-target moderation report submission server action.
//
// Server action (NOT client INSERT) — chosen because two of K's locked
// decisions are server-only obligations:
//   - Self-report block: refuse when reporter_id === target_id with a
//     clear error.
//   - 7-day rate limit: 1 report per (reporter, target_user) per 7
//     days. Schema comment (src/db/schema/reports.ts §11–14) promised
//     this is enforced in the server action layer; today neither the
//     listing nor the message report paths actually enforce it — K
//     lands the enforcement for user-target only. The existing paths
//     will close the gap in a separate small follow-up commit (banked
//     during Feature K planning, not in scope here).
//
// Reason taxonomy is the locked Nigerian-market user-target list,
// distinct from the listing taxonomy (DP-202) — the abuse vectors are
// different (impersonation, harassment, scam attempts, inappropriate
// content). Validated against the closed set both for input integrity
// and so admin queue filters render predictable values.
//
// RLS relies on the existing reports INSERT policy which checks
// auth.uid() = reporter_id (inferred from working listing + message
// paths). The authenticated supabase client carries the JWT — we pass
// reporter_id explicitly to match the precedent.

import { createClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Locked taxonomy. Keep in sync with the modal's REPORT_REASONS array
// — duplicating the literal here lets the server action validate
// against the same closed set without importing client code.
const VALID_REASONS = [
  "Impersonation",
  "Harassment or abuse",
  "Scam attempt",
  "Inappropriate content",
  "Other",
] as const;

type ValidReason = (typeof VALID_REASONS)[number];

export interface ReportUserResult {
  ok?: boolean;
  error?: string;
}

export async function reportUserAction(
  targetUserId: string,
  reason: string,
  description: string | null,
): Promise<ReportUserResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to report a user." };

  // 1. UUID shape.
  if (!targetUserId || !UUID_RE.test(targetUserId)) {
    return { error: "Invalid user. Refresh and try again." };
  }

  // 2. Self-report block. Defense-in-depth — the report button in UI
  //    is also gated by currentUserId !== target.owner_id, but a long-
  //    held form or hand-crafted request could land here without that
  //    UI gate. Clear error so the operator sees what happened.
  if (user.id === targetUserId) {
    return { error: "You cannot report your own account." };
  }

  // 3. Reason validation — must be one of the locked taxonomy values.
  if (!VALID_REASONS.includes(reason as ValidReason)) {
    return { error: "Please select a valid reason." };
  }

  // 4. Description sanitization — optional, ≤200 chars to match the
  //    DB CHECK (reports_description_length).
  const trimmedDescription = (description ?? "").trim();
  if (trimmedDescription.length > 200) {
    return { error: "Details must be 200 characters or fewer." };
  }
  const descriptionToWrite =
    trimmedDescription.length > 0 ? trimmedDescription : null;

  // 5. Rate limit: 1 per (reporter, target_user) per 7 days. Uses the
  //    reports_reporter_target_idx composite index for cheap lookup.
  //    Per Phase 1 read-pass note: existing listing + message paths do
  //    NOT enforce this today despite the schema comment; closing
  //    those gaps is a separate banked follow-up.
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: existing } = await supabase
    .from("reports")
    .select("id")
    .eq("reporter_id", user.id)
    .eq("target_type", "user")
    .eq("target_id", targetUserId)
    .gte("created_at", sevenDaysAgo)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      error: "You have already reported this user in the last 7 days.",
    };
  }

  // 6. Insert. reporter_id passed explicitly; RLS gates on auth.uid() =
  //    reporter_id. status defaults to 'new' per schema.
  const { error: insertErr } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_type: "user",
    target_id: targetUserId,
    reason,
    description: descriptionToWrite,
  });
  if (insertErr) {
    console.error("[reportUserAction] insert failed", insertErr.message);
    return { error: "Couldn't submit the report. Please try again." };
  }

  return { ok: true };
}
