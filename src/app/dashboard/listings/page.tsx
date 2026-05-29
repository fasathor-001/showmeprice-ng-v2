import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Button, Card, Badge, ToastFromSearchParams } from "@/components/ui";
import { formatNaira, timeAgo } from "@/lib/listings";
import { getVerificationState } from "@/lib/verification";
import { getProductImagePublicUrl } from "@/lib/storage";
import {
  setListingStatusAction,
  markListingSoldOutAction,
  markListingAvailableAction,
} from "@/app/(auth)/actions";
import { MarkSoldButton } from "@/components/listings/MarkSoldButton";

export const runtime = "edge";

export default async function SellerListingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/dashboard/listings");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, business_name, verification_status, rejection_reason")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!business) redirect("/sell");

  // Only fetch the latest seller_verifications row when it'd actually
  // contribute to banner state — verified sellers don't need it.
  let latestSubmission: {
    status: string;
    rejection_reason: string | null;
  } | null = null;
  if (business.verification_status !== "verified") {
    const { data } = await supabase
      .from("seller_verifications")
      .select("status, rejection_reason")
      .eq("business_id", business.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    latestSubmission = data;
  }

  const verificationState = getVerificationState({ business, latestSubmission });

  const { data: listings } = await supabase
    .from("products")
    .select(
      `
      id, title, price_kobo, is_negotiable, status, created_at,
      quantity,
      product_images ( storage_path, position ),
      categories ( supports_inventory )
    `
    )
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  const items = listings ?? [];

  return (
    <Container>
      <ToastFromSearchParams />
      <div className="py-8 sm:py-12">
        <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-1">
              Your listings
            </h1>
            <p className="text-sm text-ink-600 flex flex-wrap items-center gap-2">
              <span>{business.business_name}</span>
              {verificationState === "verified" && (
                <Badge variant="verified">Verified</Badge>
              )}
              {verificationState === "pending" && (
                <Badge variant="teal">Under review</Badge>
              )}
              {verificationState === "rejected" && (
                <Badge variant="danger">Verification rejected</Badge>
              )}
              {verificationState === "unsubmitted" && (
                <Badge variant="warning">Verification needed</Badge>
              )}
            </p>
          </div>
          <Link href="/listings/new">
            <Button variant="primary" size="md">
              + New listing
            </Button>
          </Link>
        </div>

        {verificationState === "unsubmitted" && (
          <Card className="mb-6 bg-warning-bg border-warning/30">
            <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
              <div className="flex-1">
                <p className="text-sm font-medium text-warning-text mb-1">
                  Complete verification to publish listings
                </p>
                <p className="text-xs text-warning-text">
                  Your listings won&apos;t appear publicly until your seller
                  account is verified. Verification takes 1-2 business days.
                </p>
              </div>
              <Link href="/sell/verify">
                <Button variant="primary" size="md">
                  Start verification
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {verificationState === "pending" && (
          <Card className="mb-6 bg-teal-50 border-teal-200">
            <p className="text-sm font-medium text-teal-900 mb-1">
              Your verification is under review
            </p>
            <p className="text-xs text-teal-900">
              We&apos;ll email you within 1-2 business days. Your listings
              won&apos;t appear publicly until your seller account is verified.
            </p>
          </Card>
        )}

        {verificationState === "rejected" && (
          <Card className="mb-6 bg-danger-bg border-danger/30">
            <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
              <div className="flex-1">
                <p className="text-sm font-medium text-danger-text mb-1">
                  Verification not approved
                </p>
                {(latestSubmission?.rejection_reason ||
                  business.rejection_reason) && (
                  <p className="text-xs text-danger-text mb-2">
                    Reason:{" "}
                    {latestSubmission?.rejection_reason ??
                      business.rejection_reason}
                  </p>
                )}
                <p className="text-xs text-danger-text">
                  Your listings won&apos;t appear publicly until your seller
                  account is verified. Please resubmit with corrections.
                </p>
              </div>
              <Link href="/sell/verify">
                <Button variant="primary" size="md">
                  Resubmit verification
                </Button>
              </Link>
            </div>
          </Card>
        )}

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
              const primaryImage = sortedImages[0]
                ? getProductImagePublicUrl(sortedImages[0].storage_path)
                : undefined;
              // E.2.17.0 / Step 2: out-of-stock signal + quick-action
              // affordances. Category embed lookup → out-of-stock when
              // category supports inventory AND quantity is 0. The
              // "Sold" overlay (status='sold') and "Out of stock"
              // overlay are mutually exclusive — sold takes precedence
              // when both happen to apply.
              const cat = Array.isArray(listing.categories)
                ? listing.categories[0]
                : listing.categories;
              const supportsInventory = cat?.supports_inventory === true;
              const qty = Number(listing.quantity ?? 1);
              const outOfStock = supportsInventory && qty === 0;
              return (
                <Card key={listing.id} padding="none" className="overflow-hidden">
                  <div className="aspect-square bg-neutral-100 flex items-center justify-center text-neutral-300 relative">
                    {listing.status === "sold" && (
                      <span className="absolute top-2 left-2 z-10">
                        <Badge variant="neutral">Sold</Badge>
                      </span>
                    )}
                    {listing.status !== "sold" && outOfStock && (
                      <span className="absolute top-2 left-2 z-10">
                        <Badge variant="warning">Out of stock</Badge>
                      </span>
                    )}
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
                      <div className="flex gap-2 items-center">
                        {listing.status === "sold" ? (
                          // Reactivation is the recoverable direction — plain
                          // one-click form, no confirmation (Gap B asymmetry).
                          <form action={setListingStatusAction}>
                            <input
                              type="hidden"
                              name="productId"
                              value={listing.id}
                            />
                            <input type="hidden" name="status" value="active" />
                            <button
                              type="submit"
                              className="text-teal-700 hover:text-teal-900 font-medium"
                            >
                              Reactivate
                            </button>
                          </form>
                        ) : (
                          <MarkSoldButton
                            action={setListingStatusAction}
                            productId={listing.id}
                          />
                        )}
                        {/* E.2.17.0 / Step 2: inventory quick actions.
                            Asymmetric two-button pattern — only one
                            renders at a time based on current quantity.
                            Hidden entirely when the category doesn't
                            support inventory (vehicles / property /
                            etc.) OR the listing is marked sold (the
                            seller-lifecycle action takes precedence —
                            quantity quick-actions are for transient
                            restock signaling, not permanent status). */}
                        {supportsInventory && listing.status !== "sold" && (
                          qty > 0 ? (
                            <form action={markListingSoldOutAction}>
                              <input
                                type="hidden"
                                name="productId"
                                value={listing.id}
                              />
                              <button
                                type="submit"
                                className="text-teal-700 hover:text-teal-900 font-medium"
                              >
                                Mark sold out
                              </button>
                            </form>
                          ) : (
                            <form action={markListingAvailableAction}>
                              <input
                                type="hidden"
                                name="productId"
                                value={listing.id}
                              />
                              <button
                                type="submit"
                                className="text-teal-700 hover:text-teal-900 font-medium"
                              >
                                Mark available
                              </button>
                            </form>
                          )
                        )}
                        <Link
                          href={`/listings/${listing.id}/edit`}
                          className="text-teal-700 hover:text-teal-900 font-medium"
                        >
                          Edit
                        </Link>
                        <Link
                          href={`/listings/${listing.id}/delete`}
                          className="text-danger-text hover:underline font-medium"
                          aria-label={`Delete ${listing.title}`}
                        >
                          Delete
                        </Link>
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
