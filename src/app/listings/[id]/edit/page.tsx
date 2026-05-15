import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Card } from "@/components/ui";
import { ListingForm } from "@/components/listings/ListingForm";
import { updateListingAction } from "@/app/(auth)/actions";
import { formatNaira } from "@/lib/listings";

export const runtime = "edge";

export default async function EditListingPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=/listings/${params.id}/edit`);

  const { data: listing } = await supabase
    .from("products")
    .select(
      `
      id, title, description, price_kobo, is_negotiable,
      category_id, state_id, seller_id,
      product_images ( storage_path, position )
    `
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!listing) redirect("/dashboard/listings");
  if (listing.seller_id !== user.id) redirect("/dashboard/listings");

  const [{ data: categories }, { data: states }] = await Promise.all([
    supabase.from("categories").select("id, name").order("sort_order", { ascending: true }),
    supabase.from("nigerian_states").select("id, name").order("name", { ascending: true }),
  ]);

  const imageUrls = [...(listing.product_images ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((img) => img.storage_path);

  const boundUpdateAction = updateListingAction.bind(null, listing.id);

  return (
    <Container size="narrow">
      <div className="py-8 sm:py-12 max-w-2xl mx-auto">
        <div className="mb-2 text-sm text-ink-600">
          <Link href="/dashboard/listings" className="hover:text-ink">
            ← Your listings
          </Link>
        </div>
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-1">Edit listing</h1>
        <p className="text-sm text-ink-600 mb-8">{listing.title}</p>
        <Card>
          <ListingForm
            action={boundUpdateAction}
            categories={categories ?? []}
            states={states ?? []}
            defaults={{
              title: listing.title,
              description: listing.description,
              priceInput: formatNaira(listing.price_kobo).replace("₦", ""),
              categoryId: listing.category_id,
              stateId: listing.state_id,
              negotiable: listing.is_negotiable,
              imageUrls: imageUrls.length > 0 ? imageUrls : [""],
            }}
            submitLabel="Save changes"
            pendingLabel="Saving…"
          />
        </Card>
      </div>
    </Container>
  );
}
