import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Badge, Card } from "@/components/ui";
import { searchUsers } from "@/lib/admin/search-users";
import { formatNigerianPhone } from "@/lib/auth";

// /admin/users — directory search landing for Stage 1 admin tools
// (E.2.16.0 Step 3). Unlike /admin/staff (admins-only roster, promote-by-
// search), this page searches ALL users (including admins and disabled
// accounts) so support can find a buyer/seller and act on their account.
//
// Server-rendered search via ?q=…&. No live debounce here — the staff
// page's GrantAdminPanel does live search because the result feeds back
// into a same-page action; here the next step is a redirect to /admin/users/[id],
// so a plain form submit is simpler and avoids a client-only branch on
// the landing page. (Future enhancement: same debounce shape as GrantAdminPanel
// if support starts running many lookups per session.)
//
// Inline admin guard mirrors /admin/staff + /admin/verifications + /admin.

export const runtime = "edge";

interface SearchPageProps {
  searchParams?: { q?: string };
}

export default async function AdminUsersSearchPage({
  searchParams,
}: SearchPageProps) {
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

  const rawQuery = (searchParams?.q ?? "").trim();
  let users: Awaited<ReturnType<typeof searchUsers>>["users"] = [];
  let searchError: string | null = null;
  let belowMin = false;

  if (rawQuery.length === 0) {
    // Initial render — empty state.
  } else if (rawQuery.length < 3) {
    belowMin = true;
  } else {
    const res = await searchUsers({
      query: rawQuery,
      excludeAdmins: false,
      excludeDisabled: false,
    });
    if (res.error) searchError = res.error;
    else users = res.users ?? [];
  }

  return (
    <Container>
      <div className="py-8 sm:py-12">
        <div className="mb-4 text-sm text-ink-600">
          <Link href="/admin" className="hover:text-ink">
            ← Admin
          </Link>
        </div>
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-2">
          Users
        </h1>
        <p className="text-sm text-ink-600 mb-6">
          Find a user by name, email, or phone to view their account and apply
          support actions (phone change, location change).
        </p>

        <form method="get" className="mb-6 max-w-md">
          <label
            htmlFor="users-search"
            className="block text-sm font-medium text-ink mb-1.5"
          >
            Search
          </label>
          <div className="flex gap-2">
            <input
              id="users-search"
              type="text"
              name="q"
              defaultValue={rawQuery}
              placeholder="name, email, or phone (min 3 chars)"
              autoComplete="off"
              className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700"
            >
              Search
            </button>
          </div>
        </form>

        {searchError && (
          <div
            role="alert"
            className="bg-danger-bg border border-danger/30 text-danger-text text-sm px-3 py-2.5 rounded-lg mb-4 max-w-md"
          >
            {searchError}
          </div>
        )}
        {belowMin && (
          <p className="text-sm text-ink-400 mb-4">
            Enter at least 3 characters.
          </p>
        )}

        {rawQuery.length >= 3 && !searchError && users && users.length === 0 && (
          <Card>
            <p className="py-6 text-center text-sm text-ink-600">
              No matching users.
            </p>
          </Card>
        )}

        {users && users.length > 0 && (
          <div className="space-y-3 max-w-2xl">
            {users.map((u) => (
              <Link
                key={u.id}
                href={`/admin/users/${u.id}`}
                className="block"
              >
                <Card variant="hover">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-base font-medium text-ink truncate">
                          {u.displayName}
                        </p>
                        {u.role === "admin" && (
                          <Badge variant="teal">Admin</Badge>
                        )}
                        {u.isDisabled && (
                          <Badge variant="warning">Disabled</Badge>
                        )}
                      </div>
                      <p className="text-sm text-ink-600 truncate">{u.email}</p>
                      {u.phone && (
                        <p className="text-xs text-ink-400 mt-1 tabular-nums">
                          {formatNigerianPhone(u.phone)}
                        </p>
                      )}
                    </div>
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
