import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Button, Card } from "@/components/ui";
import { formatNaira } from "@/lib/listings";
import { getProductImagePublicUrl } from "@/lib/storage";
import { deleteListingAction } from "@/app/(auth)/actions";

export const runtime = "edge";

export default async function DeleteListingPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=/listings/${params.id}/delete`);

  const { data: listing } = await supabase
    .from("products")
    .select(
      `
      id, title, price_kobo, seller_id,
      product_images ( storage_path, position )
    `
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!listing) redirect("/dashboard/listings");
  if (listing.seller_id !== user.id) redirect("/dashboard/listings");

  const sortedImages = [...(listing.product_images ?? [])].sort(
    (a, b) => a.position - b.position
  );
  const primaryImage = sortedImages[0]
    ? getProductImagePublicUrl(sortedImages[0].storage_path)
    : undefined;
  const imageCount = sortedImages.length;

  return (
    <Container size="narrow">
      <div className="py-8 sm:py-12 max-w-md mx-auto">
        <div className="mb-2 text-sm text-ink-600">
          <Link href="/dashboard/listings" className="hover:text-ink">
            ← Your listings
          </Link>
        </div>
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-2">
          Delete listing?
        </h1>
        <p className="text-sm text-ink-600 mb-6">
          This cannot be undone. The listing and all its images will be removed.
        </p>

        <Card padding="none" className="overflow-hidden mb-6">
          <div className="aspect-square bg-neutral-100 flex items-center justify-center text-neutral-300">
            {primaryImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={primaryImage}
                alt={listing.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <svg
                width="60"
                height="60"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
            )}
          </div>
          <div className="p-4">
            <p className="text-base font-medium text-ink mb-1 line-clamp-2">
              {listing.title}
            </p>
            <p className="text-sm text-ink-600 tabular-nums">
              {formatNaira(listing.price_kobo)}
            </p>
            {imageCount > 0 && (
              <p className="text-xs text-ink-400 mt-1">
                {imageCount} image{imageCount === 1 ? "" : "s"} will be deleted
              </p>
            )}
          </div>
        </Card>

        <form action={deleteListingAction} className="space-y-3">
          <input type="hidden" name="productId" value={listing.id} />
          <Button
            type="submit"
            variant="danger"
            size="lg"
            fullWidth
          >
            Yes, delete this listing
          </Button>
          <Link href="/dashboard/listings" className="block">
            <Button type="button" variant="ghost" size="lg" fullWidth>
              Cancel
            </Button>
          </Link>
        </form>
      </div>
    </Container>
  );
}
