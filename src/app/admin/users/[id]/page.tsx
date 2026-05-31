import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Container } from "@/components/layout";
import { Badge, Card, ToastFromSearchParams } from "@/components/ui";
import { formatNigerianPhone, isPhoneVerified } from "@/lib/auth";
import { formatLocation } from "@/lib/location/format";
import { ChangePhoneForm } from "./ChangePhoneForm";
import { ChangeLocationForm } from "./ChangeLocationForm";
import { SuspendUserPanel } from "./SuspendUserPanel";

// /admin/users/[id] — user-detail page for Stage 1 admin tools
// (E.2.16.0 Step 3). Read-only display of the user's current account state
// plus the two support-action forms (phone change, location change). Recent
// activity reads profile_admin_changes (RLS permits admin SELECT — verified
// in E.2.15.0 §2f).
//
// Email is enriched via the service-role admin client (auth.users), same as
// /admin/staff. profile is read via the user's own admin-session supabase
// client (admin RLS on profiles permits reading is_disabled rows).
//
// Inline admin guard mirrors siblings.

export const runtime = "edge";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: { id: string };
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  phone: string | null;
  state_id: string | null;
  role: string | null;
  is_disabled: boolean;
  verification_status: string[];
  created_at: string | null;
}

interface AdminChangeRow {
  id: string;
  action: string;
  previous_value: string | null;
  new_value: string | null;
  reason: string;
  created_at: string;
  granter_id: string | null;
}

interface StateRow {
  id: string;
  name: string;
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  if (!UUID_RE.test(params.id)) notFound();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=/admin/users/${params.id}`);

  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (actorProfile?.role !== "admin") redirect("/dashboard");

  // Service-role for email enrichment + target-profile read that bypasses
  // public-read RLS (catches is_disabled=true users that the directory
  // search surfaced).
  const adminClient = createAdminClient();

  const [
    { data: targetProfileRaw },
    { data: authUserResp },
    { data: changesRaw },
    { data: statesRaw },
    { data: businessWithVerifsRaw },
  ] = await Promise.all([
    adminClient
      .from("profiles")
      .select(
        `id, display_name, phone, state_id, role, is_disabled,
         verification_status, created_at`,
      )
      .eq("id", params.id)
      .maybeSingle(),
    adminClient.auth.admin.getUserById(params.id),
    adminClient
      .from("profile_admin_changes")
      .select("id, action, previous_value, new_value, reason, created_at, granter_id")
      .eq("target_user_id", params.id)
      .order("created_at", { ascending: false })
      .limit(5),
    adminClient
      .from("nigerian_states")
      .select("id, name")
      .order("name", { ascending: true }),
    // Latest verification submission for this user (if they own a business).
    // Path: profiles.id = businesses.owner_id → seller_verifications.business_id.
    // Embed returns all verifications for the business; we sort + take newest
    // in-memory (PostgREST nested ordering+limit is awkward; this list is
    // bounded by how many times one seller has re-submitted, so it's small).
    adminClient
      .from("businesses")
      .select(
        `id, state_id, city_area,
         nigerian_states ( name ),
         seller_verifications ( id, status, submitted_at, reviewed_at )`,
      )
      .eq("owner_id", params.id)
      .maybeSingle(),
  ]);

  if (!targetProfileRaw) notFound();
  const targetProfile = targetProfileRaw as unknown as ProfileRow;
  const targetEmail = authUserResp?.user?.email ?? "—";
  const changes = (changesRaw ?? []) as AdminChangeRow[];
  const states = (statesRaw ?? []) as StateRow[];

  const phoneVerified = isPhoneVerified(targetProfile.verification_status);

  // Derive the latest seller_verifications row (any status). Sorted newest-
  // first by submitted_at. NULL if the user has no business OR has a business
  // but never submitted verification. The link target works for verified +
  // rejected too — the detail page renders documents regardless of status,
  // only the ReviewActions block is pending-gated.
  const businessWithVerifs = businessWithVerifsRaw as
    | {
        id: string;
        state_id: string | null;
        city_area: string | null;
        nigerian_states:
          | { name: string }
          | { name: string }[]
          | null;
        seller_verifications:
          | {
              id: string;
              status: string;
              submitted_at: string;
              reviewed_at: string | null;
            }[]
          | null;
      }
    | null;

  // Business location for the Account card. Sourced from the user's owned
  // business (businesses.owner_id is UNIQUE per src/db/schema/businesses.ts,
  // so this is always at most one row; .maybeSingle() above is correct
  // cardinality — no multi-business branch needed). Distinct from
  // profiles.state_id which is only ever written by the admin
  // change-location RPC; the profile column stays the write target for the
  // Change Location form below, unchanged.
  const ownedBusinessStateName = businessWithVerifs
    ? Array.isArray(businessWithVerifs.nigerian_states)
      ? (businessWithVerifs.nigerian_states[0]?.name ?? null)
      : (businessWithVerifs.nigerian_states?.name ?? null)
    : null;
  // city_area passes straight through — formatLocation now title-cases
  // the city portion internally (E.2.21.x location helper consolidation),
  // so the explicit wrap that used to live here is no longer needed.
  const businessLocation = formatLocation(
    businessWithVerifs?.city_area ?? null,
    ownedBusinessStateName,
  );
  const latestVerification =
    businessWithVerifs?.seller_verifications &&
    businessWithVerifs.seller_verifications.length > 0
      ? [...businessWithVerifs.seller_verifications].sort(
          (a, b) =>
            new Date(b.submitted_at).getTime() -
            new Date(a.submitted_at).getTime(),
        )[0]
      : null;

  return (
    <Container>
      <ToastFromSearchParams />
      <div className="py-8 sm:py-12">
        <div className="mb-4 text-sm text-ink-600">
          <Link href="/admin/users" className="hover:text-ink">
            ← Users
          </Link>
        </div>

        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-medium text-ink">
            {targetProfile.display_name ?? "—"}
          </h1>
          {targetProfile.role === "admin" && (
            <Badge variant="teal">Admin</Badge>
          )}
          {targetProfile.is_disabled && (
            <Badge variant="warning">Disabled</Badge>
          )}
        </div>
        <p className="text-sm text-ink-600 mb-8 break-all">{targetEmail}</p>

        <div className="grid gap-4 sm:grid-cols-2 max-w-4xl">
          {/* Current state — read-only */}
          <Card>
            <h2 className="text-sm font-medium text-ink mb-4">Account</h2>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-ink-600 text-xs">Phone</dt>
                <dd className="flex items-center gap-2 flex-wrap">
                  <span className="text-ink tabular-nums">
                    {targetProfile.phone
                      ? formatNigerianPhone(targetProfile.phone)
                      : "—"}
                  </span>
                  {phoneVerified ? (
                    <Badge variant="verified">Verified</Badge>
                  ) : (
                    <Badge variant="warning">Unverified</Badge>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-ink-600 text-xs">Business location</dt>
                <dd className="text-ink">{businessLocation ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-600 text-xs">User ID</dt>
                <dd className="text-xs text-ink-400 break-all font-mono">
                  {targetProfile.id}
                </dd>
              </div>
              {targetProfile.created_at && (
                <div>
                  <dt className="text-ink-600 text-xs">Joined</dt>
                  <dd className="text-ink">
                    {new Date(targetProfile.created_at).toLocaleDateString(
                      "en-NG",
                      { year: "numeric", month: "short", day: "numeric" },
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Recent admin actions on this user */}
          <Card>
            <h2 className="text-sm font-medium text-ink mb-4">
              Recent admin actions
            </h2>
            {changes.length === 0 ? (
              <p className="text-sm text-ink-400">No admin actions yet.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {changes.map((c) => (
                  <li
                    key={c.id}
                    className="border-l-2 border-neutral-200 pl-3"
                  >
                    <p className="text-ink">
                      <span className="font-medium">
                        {c.action === "phone_changed"
                          ? "Phone changed"
                          : c.action === "location_changed"
                            ? "Location changed"
                            : c.action === "account_suspended"
                              ? "Account suspended"
                              : c.action === "account_unsuspended"
                                ? "Account unsuspended"
                                : c.action}
                      </span>
                    </p>
                    {(c.previous_value || c.new_value) && (
                      <p className="text-xs text-ink-600 mt-0.5">
                        {c.previous_value ?? "—"} → {c.new_value ?? "—"}
                      </p>
                    )}
                    <p className="text-xs text-ink-400 mt-0.5">{c.reason}</p>
                    <p className="text-xs text-ink-400 mt-0.5">
                      {new Date(c.created_at).toLocaleString("en-NG")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Verification submission — links to the verification detail page
            (documents, NIN, address) regardless of status. Only renders if
            this user owns a business AND has at least one submission on
            record. */}
        {latestVerification && (
          <div className="mt-4 max-w-4xl">
            <Card>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="text-sm font-medium text-ink">
                      Verification submission
                    </h2>
                    {latestVerification.status === "pending" && (
                      <Badge variant="warning">Pending</Badge>
                    )}
                    {latestVerification.status === "verified" && (
                      <Badge variant="verified">Verified</Badge>
                    )}
                    {latestVerification.status === "rejected" && (
                      <Badge variant="danger">Rejected</Badge>
                    )}
                  </div>
                  <p className="text-xs text-ink-600">
                    Submitted{" "}
                    {new Date(
                      latestVerification.submitted_at,
                    ).toLocaleDateString("en-NG", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                    {latestVerification.reviewed_at && (
                      <>
                        {" "}
                        · reviewed{" "}
                        {new Date(
                          latestVerification.reviewed_at,
                        ).toLocaleDateString("en-NG", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </>
                    )}
                  </p>
                </div>
                <Link
                  href={`/admin/verifications/${latestVerification.id}`}
                  className="text-sm text-teal-700 hover:text-teal-900 font-medium shrink-0"
                >
                  View submission →
                </Link>
              </div>
            </Card>
          </div>
        )}

        {/* Support actions */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 max-w-4xl">
          <Card>
            <h2 className="text-sm font-medium text-ink mb-1">
              Change phone number
            </h2>
            <p className="text-xs text-ink-600 mb-4">
              Writes a new phone, revokes phone-verified, removes any
              phone-based auth providers. Audited.
            </p>
            <ChangePhoneForm
              targetUserId={targetProfile.id}
              currentPhone={targetProfile.phone}
            />
          </Card>

          <Card>
            <h2 className="text-sm font-medium text-ink mb-1">
              Change location (state)
            </h2>
            <p className="text-xs text-ink-600 mb-4">
              Updates the user&apos;s state. Audited.
            </p>
            <ChangeLocationForm
              targetUserId={targetProfile.id}
              currentStateId={targetProfile.state_id}
              states={states}
            />
          </Card>
        </div>

        {/* Feature J.3 — moderation action. Separated from the support-action
            grid above because suspension is materially higher-stakes:
            cascades businesses.is_disabled=true and hides every owned
            listing across the 6 D-146 public surfaces. Own row, distinct
            visual treatment. */}
        <div className="mt-8 max-w-4xl">
          <Card>
            <h2 className="text-sm font-medium text-ink mb-1">
              {targetProfile.is_disabled
                ? "Unsuspend account"
                : "Suspend account"}
            </h2>
            <p className="text-xs text-ink-600 mb-4">
              {targetProfile.is_disabled
                ? "Restores the user's ability to sign in and use the app. Owned businesses stay disabled — re-enable each separately. Audited."
                : "Blocks the user from signing in and using the app. Owned businesses are auto-disabled and listings hidden from public browse. Audited."}
            </p>
            <SuspendUserPanel
              targetUserId={targetProfile.id}
              targetDisplayName={targetProfile.display_name ?? "this user"}
              isTargetSuspended={targetProfile.is_disabled}
              isSelfTarget={user.id === targetProfile.id}
            />
          </Card>
        </div>
      </div>
    </Container>
  );
}
