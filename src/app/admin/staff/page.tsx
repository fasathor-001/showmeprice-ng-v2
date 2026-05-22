import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Container } from "@/components/layout";
import { Badge, Card, ToastFromSearchParams } from "@/components/ui";
import { GrantAdminPanel } from "./GrantAdminPanel";
import { RevokeAdminControl } from "./RevokeAdminControl";

export const runtime = "edge";

interface AdminRow {
  id: string;
  email: string;
  displayName: string;
  isDisabled: boolean;
  createdAt: string | null;
}

// Admin staff management (D-107, renamed from /admin/users). Lists only users
// with role='admin' (no general user directory — see K-025). New admins are
// promoted via the search-and-grant panel; existing admins are revoked inline.
// Inline admin guard mirrors /admin/verifications and /admin (shared
// requireAdmin migration still deferred).
export default async function AdminStaffPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/admin/staff");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  // Authoritative admin set from profiles; emails enriched from auth.users via
  // the admin client. LIMITATION: email enrichment uses listUsers(perPage:200) —
  // an admin beyond the first 200 auth users would show "—" for email
  // (cosmetic only; the row still renders + revokes correctly). Acceptable at
  // MVP scale.
  const admin = createAdminClient();
  const { data: adminProfiles } = await admin
    .from("profiles")
    .select("id, display_name, is_disabled, created_at")
    .eq("role", "admin");
  const { data: authList } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const emailById = new Map<string, string>(
    (authList?.users ?? []).map((u) => [u.id, u.email ?? "—"]),
  );

  type AdminProfile = {
    id: string;
    display_name: string | null;
    is_disabled: boolean;
    created_at: string | null;
  };
  const rows: AdminRow[] = ((adminProfiles ?? []) as AdminProfile[]).map((p) => ({
    id: p.id,
    email: emailById.get(p.id) ?? "—",
    displayName: p.display_name ?? "—",
    isDisabled: p.is_disabled,
    createdAt: p.created_at,
  }));

  rows.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const activeAdminCount = rows.filter((r) => !r.isDisabled).length;

  return (
    <Container>
      <ToastFromSearchParams />
      <div className="py-8 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-2">Staff</h1>
        <p className="text-sm text-ink-600 mb-6">
          {rows.length} {rows.length === 1 ? "admin" : "admins"}
        </p>

        <div className="mb-8">
          <GrantAdminPanel />
        </div>

        {rows.length === 0 ? (
          <Card>
            <p className="py-8 text-center text-sm text-ink-600">
              No admins found.
            </p>
          </Card>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {rows.map((r) => {
              const isSelf = r.id === user.id;
              const isLastAdmin = !r.isDisabled && activeAdminCount <= 1;
              const revokeDisabledReason: "self" | "last_admin" | null = isSelf
                ? "self"
                : isLastAdmin
                  ? "last_admin"
                  : null;

              return (
                <Card key={r.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-base font-medium text-ink truncate">
                          {r.displayName}
                        </p>
                        <Badge variant="teal">Admin</Badge>
                        {r.isDisabled && (
                          <Badge variant="warning">Disabled</Badge>
                        )}
                      </div>
                      <p className="text-sm text-ink-600 truncate">{r.email}</p>
                      {r.createdAt && (
                        <p className="text-xs text-ink-400 mt-1">
                          Joined{" "}
                          {new Date(r.createdAt).toLocaleDateString("en-NG", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      <RevokeAdminControl
                        userId={r.id}
                        displayName={r.displayName}
                        revokeDisabledReason={revokeDisabledReason}
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Container>
  );
}
