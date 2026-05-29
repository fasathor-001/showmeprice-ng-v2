import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Card } from "@/components/ui";
import { EditListingForm } from "@/components/listings/EditListingForm";
import { updateListingAction } from "@/app/(auth)/actions";
import { formatNaira } from "@/lib/listings";
import { getProductImagePublicUrl } from "@/lib/storage";
import { getVerificationState } from "@/lib/verification";

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

  // Load the seller's business to (a) check ownership against the listing
  // and (b) gate on verification status. Same defensive layering used by
  // /listings/new (Phase C.5.8).
  const { data: business } = await supabase
    .from("businesses")
    .select("id, verification_status, rejection_reason")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!business) redirect("/sell");

  let latestSubmission: { status: string } | null = null;
  if (business.verification_status !== "verified") {
    const { data } = await supabase
      .from("seller_verifications")
      .select("status")
      .eq("business_id", business.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    latestSubmission = data;
  }
  const verificationState = getVerificationState({ business, latestSubmission });
  if (verificationState !== "verified") {
    redirect("/dashboard/listings");
  }

  const { data: listing } = await supabase
    .from("products")
    .select(
      `
      id, title, description, price_kobo, is_negotiable,
      category_id, state_id, city_area, seller_id, business_id, category_specs,
      quantity,
      product_images ( storage_path, position )
    `
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!listing) redirect("/dashboard/listings");
  if (listing.seller_id !== user.id) redirect("/dashboard/listings");
  if (listing.business_id !== business.id) redirect("/dashboard/listings");

  const [{ data: categories }, { data: states }] = await Promise.all([
    supabase
      .from("categories")
      // slug + parent_id are needed by CategorySpecFields (D.7) to resolve
      // which spec schema applies for the selected category.
      // supports_inventory (E.2.17.0) drives the conditional quantity
      // field on EditListingForm.
      .select("id, name, slug, parent_id, supports_inventory")
      .order("sort_order", { ascending: true }),
    supabase.from("nigerian_states").select("id, name").order("name", { ascending: true }),
  ]);

  const existingImages = [...(listing.product_images ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((img) => ({
      storage_path: img.storage_path,
      public_url: getProductImagePublicUrl(img.storage_path),
    }));

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
          <EditListingForm
            action={boundUpdateAction}
            categories={categories ?? []}
            states={states ?? []}
            businessId={business.id}
            productId={listing.id}
            existingImages={existingImages}
            defaults={{
              title: listing.title,
              description: listing.description,
              priceInput: formatNaira(listing.price_kobo).replace("₦", ""),
              categoryId: listing.category_id ?? "",
              stateId: listing.state_id ?? "",
              cityArea: listing.city_area ?? "", // Sprint 3 / Gap D.5 — legacy NULL → "" prompts backfill
              negotiable: listing.is_negotiable,
              categorySpecs: (listing.category_specs ?? undefined) as
                | Record<string, string | number>
                | undefined,
              // E.2.17.0 / Step 2: existing stock count. DB column is
              // NOT NULL DEFAULT 1; always set.
              quantity: (listing.quantity as number | null) ?? 1,
            }}
          />
        </Card>
      </div>
    </Container>
  );
}
