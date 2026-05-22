import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Card, ToastFromSearchParams } from "@/components/ui";

export const runtime = "edge";

// Admin landing page (D-106 / Stage 2.A.2). Inline admin guard mirrors
// /admin/users and /admin/verifications (shared requireAdmin migration still
// deferred). Cards link to existing admin features; per D-107 sequencing the
// User Management card points at /admin/users now and updates atomically with
// the /admin/staff rename in Stage 2.A.3.
export default async function AdminLandingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  const cards = [
    {
      href: "/admin/users",
      title: "User Management",
      description: "Grant or revoke admin role; manage user accounts.",
    },
    {
      href: "/admin/verifications",
      title: "Business Verifications",
      description: "Review and approve seller verification submissions.",
    },
  ];

  return (
    <Container>
      <ToastFromSearchParams />
      <div className="py-8 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-2">Admin</h1>
        <p className="text-sm text-ink-600 mb-8">
          Administrative tools for ShowMePrice.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className="block">
              <Card variant="hover">
                <h2 className="text-base font-medium text-ink mb-1">{c.title}</h2>
                <p className="text-sm text-ink-600">{c.description}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </Container>
  );
}
