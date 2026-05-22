import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Container } from "@/components/layout";
import { Badge, Card, ToastFromSearchParams } from "@/components/ui";
import { UserAdminControls } from "./UserAdminControls";

export const runtime = "edge";

interface ProfileRow {
  id: string;
  display_name: string | null;
  role: string | null;
  is_disabled: boolean;
  user_type: string | null;
  created_at: string;
}

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  role: string | null;
  userType: string | null;
  isDisabled: boolean;
  createdAt: string | null;
}

export default async function AdminUsersPage() {
  // Inline admin guard — same shape as /admin/verifications (kept inline until
  // a later cleanup migrates all /admin/* pages to the shared requireAdmin).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/admin/users");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  // Emails live in auth.users (not exposed via PostgREST), so list them via the
  // service-role admin client and merge with profiles in JS. The 200-row cap is
  // ample at v2 scale; pagination is deferred (YAGNI).
  const admin = createAdminClient();
  const { data: authList } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name, role, is_disabled, user_type, created_at")
    .limit(200);

  const profileById = new Map<string, ProfileRow>(
    ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p] as [string, ProfileRow])
  );

  const rows: UserRow[] = (authList?.users ?? []).map((u) => {
    const p = profileById.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "—",
      displayName: p?.display_name ?? "—",
      role: p?.role ?? null,
      userType: p?.user_type ?? null,
      isDisabled: p?.is_disabled ?? false,
      createdAt: p?.created_at ?? u.created_at ?? null,
    };
  });

  // Admins first, then alphabetical by display name.
  rows.sort((a, b) => {
    const aAdmin = a.role === "admin" ? 0 : 1;
    const bAdmin = b.role === "admin" ? 0 : 1;
    if (aAdmin !== bAdmin) return aAdmin - bAdmin;
    return a.displayName.localeCompare(b.displayName);
  });

  const activeAdminCount = rows.filter(
    (r) => r.role === "admin" && !r.isDisabled
  ).length;

  return (
    <Container>
      <ToastFromSearchParams />
      <div className="py-8 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-2">Users</h1>
        <p className="text-sm text-ink-600 mb-8">
          {rows.length} {rows.length === 1 ? "user" : "users"}
        </p>

        {rows.length === 0 ? (
          <Card>
            <p className="py-8 text-center text-sm text-ink-600">
              No users found.
            </p>
          </Card>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {rows.map((r) => {
              const isAdmin = r.role === "admin";
              const isSelf = r.id === user.id;
              const isLastAdmin =
                isAdmin && !r.isDisabled && activeAdminCount <= 1;
              const revokeDisabledReason: "self" | "last_admin" | null = isAdmin
                ? isSelf
                  ? "self"
                  : isLastAdmin
                    ? "last_admin"
                    : null
                : null;

              const roleLabel = isAdmin
                ? "Admin"
                : r.userType === "seller"
                  ? "Seller"
                  : "Buyer";

              return (
                <Card key={r.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-base font-medium text-ink truncate">
                          {r.displayName}
                        </p>
                        <Badge variant={isAdmin ? "teal" : "neutral"}>
                          {roleLabel}
                        </Badge>
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
                      <UserAdminControls
                        userId={r.id}
                        displayName={r.displayName}
                        isAdmin={isAdmin}
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
