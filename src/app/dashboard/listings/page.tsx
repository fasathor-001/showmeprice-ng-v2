import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Button, Card, Badge, ToastFromSearchParams } from "@/components/ui";
import { formatNaira, timeAgo } from "@/lib/listings";
import { DeleteListingButton } from "./DeleteListingButton";

export const runtime = "edge";

export default async function SellerListingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/dashboard/listings");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, business_name, verification_status")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!business) redirect("/sell");

  const { data: listings } = await supabase
    .from("products")
    .select(
      `
      id, title, price_kobo, is_negotiable, status, created_at,
      product_images ( storage_path, position )
    `
    )
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  const items = listings ?? [];

  return (
    <Container>
      <ToastFromSearchParams />
      <div className="py-8 sm:py-12">
        <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-3 sm:gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-1">
              Your listings
            </h1>
            <p className="text-sm text-ink-600">
              {business.business_name}
              {business.verification_status !== "verified" && (
                <span className="ml-2 inline-flex">
                  <Badge variant="warning">Verification pending</Badge>
                </span>
              )}
            </p>
          </div>
          <Link href="/listings/new">
            <Button variant="primary" size="md">
              + New listing
            </Button>
          </Link>
        </div>

        {items.length === 0 ? (
          <Card>
            <div className="py-8 text-center">
              <p className="text-base text-ink mb-1">No listings yet.</p>
              <p className="text-sm text-ink-600 mb-6">
                Post your first listing to start selling.
              </p>
              <Link href="/listings/new">
                <Button variant="primary" size="md">
                  Post your first listing
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((listing) => {
              const sortedImages = [...(listing.product_images ?? [])].sort(
                (a, b) => a.position - b.position
              );
              const primaryImage = sortedImages[0]?.storage_path;
              return (
                <Card key={listing.id} padding="none" className="overflow-hidden">
                  <div className="aspect-square bg-neutral-100 flex items-center justify-center text-neutral-300 relative">
                    {primaryImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={primaryImage}
                        alt={listing.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg
                        width="40"
                        height="40"
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
                  <div className="p-3">
                    <h3 className="text-sm font-medium text-ink leading-snug mb-1 line-clamp-2">
                      {listing.title}
                    </h3>
                    <p className="text-base font-medium text-ink tabular-nums mb-2">
                      {formatNaira(listing.price_kobo)}
                      {listing.is_negotiable && (
                        <span className="text-xs text-ink-600 ml-1.5">neg.</span>
                      )}
                    </p>
                    <div className="flex items-center justify-between text-xs text-ink-600">
                      <span>{timeAgo(listing.created_at)}</span>
                      <div className="flex gap-2">
                        <Link
                          href={`/listings/${listing.id}/edit`}
                          className="text-teal-700 hover:text-teal-900 font-medium"
                        >
                          Edit
                        </Link>
                        <DeleteListingButton
                          productId={listing.id}
                          title={listing.title}
                        />
                      </div>
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
