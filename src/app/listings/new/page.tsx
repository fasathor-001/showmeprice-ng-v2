import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Card } from "@/components/ui";
import { ListingForm } from "@/components/listings/ListingForm";
import { createListingAction } from "@/app/(auth)/actions";

export const runtime = "edge";

export default async function NewListingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/listings/new");

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!business) redirect("/sell");

  const [{ data: categories }, { data: states }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name")
      .order("sort_order", { ascending: true }),
    supabase
      .from("nigerian_states")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);

  return (
    <Container size="narrow">
      <div className="py-8 sm:py-12 max-w-2xl mx-auto">
        <div className="mb-2 text-sm text-ink-600">
          <Link href="/dashboard/listings" className="hover:text-ink">
            ← Your listings
          </Link>
        </div>
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-1">New listing</h1>
        <p className="text-sm text-ink-600 mb-8">
          Share what you&apos;re selling. Real prices, no haggling games.
        </p>
        <Card>
          <ListingForm
            action={createListingAction}
            categories={categories ?? []}
            states={states ?? []}
            submitLabel="Publish listing"
            pendingLabel="Publishing…"
          />
        </Card>
      </div>
    </Container>
  );
}
