import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Badge, Card, ToastFromSearchParams } from "@/components/ui";

export const runtime = "edge";

export default async function VerificationQueuePage() {
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

  const { data: pending } = await supabase
    .from("seller_verifications")
    .select(
      `
      id, legal_first_name, legal_last_name, submitted_at,
      businesses ( business_name )
    `
    )
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });

  const items = pending ?? [];

  return (
    <Container>
      <ToastFromSearchParams />
      <div className="py-8 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-2">
          Verification queue
        </h1>
        <p className="text-sm text-ink-600 mb-8">
          {items.length} pending{" "}
          {items.length === 1 ? "submission" : "submissions"}
        </p>

        {items.length === 0 ? (
          <Card>
            <p className="py-8 text-center text-sm text-ink-600">
              No pending submissions.
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
                            }
                          )}
                        </p>
                      </div>
                      <Badge variant="warning">Review</Badge>
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
