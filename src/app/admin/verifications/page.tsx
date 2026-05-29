import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Badge, Card, ToastFromSearchParams } from "@/components/ui";

// /admin/verifications — three-tab triage queue (Pending / Verified / Rejected)
// with a legal-name search.
//
// Defaults:
//   Pending tab, FIFO sort (oldest submitted first — work queue fairness).
//   Top 10 shown; older items reachable via search.
//
// Verified + Rejected tabs:
//   submitted_at DESC (last 10 submitted), reference view (not a work queue).
//   Search bypasses the 10-item limit.
//
// Search:
//   Legal first or last name (ILIKE substring), min 3 chars. Input is
//   sanitized to alphanumerics + space + hyphen + apostrophe to keep the
//   PostgREST .or() filter safe (no comma/quote injection into the embed
//   query). Business-name search deferred — would require cross-table OR
//   via embed which has PostgREST quirks; legal name covers the common case.
//
// Wording standardization: "Verified" (matches the DB enum + dashboard +
// settings copy). The badge in the row reads "Review" for pending only
// (action-oriented for the work queue); Verified/Rejected rows reuse the
// status word.

export const runtime = "edge";

const DEFAULT_LIMIT = 5;
const SEARCH_MIN = 3;

type StatusFilter = "pending" | "verified" | "rejected";
const VALID_STATUSES: ReadonlyArray<StatusFilter> = [
  "pending",
  "verified",
  "rejected",
];

interface SearchPageProps {
  searchParams?: { status?: string; q?: string };
}

export default async function VerificationQueuePage({
  searchParams,
}: SearchPageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/admin/verifications");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  // Parse + validate status param. Anything off the allowlist → default pending.
  const rawStatus = searchParams?.status;
  const status: StatusFilter = VALID_STATUSES.includes(
    rawStatus as StatusFilter,
  )
    ? (rawStatus as StatusFilter)
    : "pending";

  // Parse + sanitize search query. Strip everything except alphanumerics,
  // space, hyphen, apostrophe — covers real names ("Okafor", "O'Brien",
  // "Smith-Jones") while preventing PostgREST .or() syntax injection.
  const rawQuery = (searchParams?.q ?? "").trim();
  const safeQuery = rawQuery.replace(/[^a-zA-Z0-9 \-']/g, "").trim();
  const hasSearch = safeQuery.length >= SEARCH_MIN;
  const belowMin = rawQuery.length > 0 && safeQuery.length < SEARCH_MIN;

  // Parallel: three count queries (one per status, all-time) + main list.
  // head:true makes the counts cheap — no rows returned, just the total.
  const [
    { count: pendingCount },
    { count: verifiedCount },
    { count: rejectedCount },
    listResult,
  ] = await Promise.all([
    supabase
      .from("seller_verifications")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("seller_verifications")
      .select("id", { count: "exact", head: true })
      .eq("status", "verified"),
    supabase
      .from("seller_verifications")
      .select("id", { count: "exact", head: true })
      .eq("status", "rejected"),
    (() => {
      let q = supabase
        .from("seller_verifications")
        .select(
          `id, legal_first_name, legal_last_name, submitted_at, reviewed_at,
           businesses ( business_name )`,
        )
        .eq("status", status);

      if (hasSearch) {
        q = q.or(
          `legal_first_name.ilike.%${safeQuery}%,legal_last_name.ilike.%${safeQuery}%`,
        );
      }

      // Pending = FIFO (oldest first). Verified/Rejected = newest submission first.
      const ascending = status === "pending";
      q = q.order("submitted_at", { ascending });

      // Search bypasses the default cap; admin asked for the specific thing.
      if (!hasSearch) {
        q = q.limit(DEFAULT_LIMIT);
      }
      return q;
    })(),
  ]);

  const items = listResult.data ?? [];
  const totalForStatus =
    status === "pending"
      ? pendingCount ?? 0
      : status === "verified"
        ? verifiedCount ?? 0
        : rejectedCount ?? 0;

  // Build tab links that preserve the search query (so an admin can scan
  // their search across statuses without re-typing).
  function tabHref(s: StatusFilter): string {
    const params = new URLSearchParams();
    if (s !== "pending") params.set("status", s);
    if (safeQuery) params.set("q", safeQuery);
    const qs = params.toString();
    return qs ? `/admin/verifications?${qs}` : "/admin/verifications";
  }

  const tabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: "pending", label: "Pending", count: pendingCount ?? 0 },
    { key: "verified", label: "Verified", count: verifiedCount ?? 0 },
    { key: "rejected", label: "Rejected", count: rejectedCount ?? 0 },
  ];

  const emptyMessage = hasSearch
    ? "No matching submissions found."
    : status === "pending"
      ? "No pending verification submissions."
      : status === "verified"
        ? "No verified verification submissions."
        : "No rejected verification submissions.";

  return (
    <Container>
      <ToastFromSearchParams />
      <div className="py-8 sm:py-12">
        <div className="mb-4 text-sm text-ink-600">
          <Link href="/admin" className="hover:text-ink">
            ← Admin
          </Link>
        </div>
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-6">
          Verifications
        </h1>

        {/* Tab strip — counts shown beside each label. */}
        <div className="flex gap-1 border-b border-neutral-200 mb-6 overflow-x-auto">
          {tabs.map((t) => {
            const isActive = t.key === status;
            return (
              <Link
                key={t.key}
                href={tabHref(t.key)}
                className={
                  isActive
                    ? "px-4 py-2 text-sm font-medium border-b-2 border-teal-600 text-teal-700 whitespace-nowrap"
                    : "px-4 py-2 text-sm text-ink-600 hover:text-ink border-b-2 border-transparent whitespace-nowrap"
                }
              >
                {t.label} ({t.count})
              </Link>
            );
          })}
        </div>

        {/* Search form — preserves the active status via hidden input. */}
        <form method="get" className="mb-6 max-w-md">
          {status !== "pending" && (
            <input type="hidden" name="status" value={status} />
          )}
          <label
            htmlFor="verif-search"
            className="block text-sm font-medium text-ink mb-1.5"
          >
            Search by name
          </label>
          <div className="flex gap-2">
            <input
              id="verif-search"
              type="text"
              name="q"
              defaultValue={rawQuery}
              placeholder="legal first or last name (min 3 chars)"
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

        {belowMin && (
          <p className="text-sm text-ink-400 mb-4">
            Enter at least {SEARCH_MIN} characters.
          </p>
        )}

        {/* Count copy — only shown when there's something to qualify. */}
        {!hasSearch && items.length > 0 && totalForStatus > items.length && (
          <p className="text-sm text-ink-600 mb-4">
            Showing {items.length} of {totalForStatus}. Use search to find
            older submissions.
          </p>
        )}
        {hasSearch && items.length > 0 && (
          <p className="text-sm text-ink-600 mb-4">
            {items.length} {items.length === 1 ? "match" : "matches"} for
            &quot;{safeQuery}&quot; in {status}.
          </p>
        )}

        {items.length === 0 ? (
          <Card>
            <p className="py-8 text-center text-sm text-ink-600">
              {emptyMessage}
            </p>
          </Card>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {items.map((item) => {
              const biz = Array.isArray(item.businesses)
                ? item.businesses[0]
                : item.businesses;
              return (
                <Link
                  key={item.id}
                  href={`/admin/verifications/${item.id}`}
                  className="block"
                >
                  <Card variant="hover">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-base font-medium text-ink">
                          {item.legal_first_name ?? "—"}{" "}
                          {item.legal_last_name ?? ""}
                        </p>
                        <p className="text-sm text-ink-600 truncate">
                          {biz?.business_name ?? "—"}
                        </p>
                        <p className="text-xs text-ink-400 mt-1">
                          Submitted{" "}
                          {new Date(item.submitted_at).toLocaleDateString(
                            "en-NG",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                          {item.reviewed_at &&
                            (status === "verified" ||
                              status === "rejected") && (
                              <>
                                {" "}
                                · reviewed{" "}
                                {new Date(
                                  item.reviewed_at,
                                ).toLocaleDateString("en-NG", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </>
                            )}
                        </p>
                      </div>
                      {status === "pending" && (
                        <Badge variant="warning">Review</Badge>
                      )}
                      {status === "verified" && (
                        <Badge variant="verified">Verified</Badge>
                      )}
                      {status === "rejected" && (
                        <Badge variant="danger">Rejected</Badge>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Container>
  );
}
