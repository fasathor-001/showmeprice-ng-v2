import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Button, Card } from "@/components/ui";
import { NewListingForm } from "@/components/listings/NewListingForm";
import { createListingAction } from "@/app/(auth)/actions";
import { getVerificationState } from "@/lib/verification";
import { requirePhoneVerified } from "@/lib/auth";
import { filterToLaunchStates } from "@/lib/location/launch-states";

export const runtime = "edge";

export default async function NewListingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/listings/new");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, verification_status, rejection_reason")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!business) redirect("/sell");

  // Disambiguate 'unsubmitted' from 'pending' via the latest seller_verifications
  // row. (See /sell page for the same pattern + rationale.)
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

  if (verificationState !== "verified") {
    const rejectionReason =
      latestSubmission?.rejection_reason ?? business.rejection_reason;
    return (
      <Container size="narrow">
        <div className="py-8 sm:py-12 max-w-2xl mx-auto">
          <div className="mb-2 text-sm text-ink-600">
            <Link href="/dashboard/listings" className="hover:text-ink">
              ← Your listings
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-1">
            Complete verification before creating listings
          </h1>
          <p className="text-sm text-ink-600 mb-6">
            Your listings won&apos;t appear on the marketplace until your seller
            account is verified.
          </p>

          {verificationState === "unsubmitted" && (
            <Card className="bg-warning-bg border-warning/30">
              <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
                <div className="flex-1">
                  <p className="text-sm font-medium text-warning-text mb-1">
                    Verification needed
                  </p>
                  <p className="text-xs text-warning-text">
                    Your listings won&apos;t appear publicly until your seller
                    account is verified. Submit your ID, address, and NIN —
                    review takes 1-2 business days.
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
            <Card className="bg-teal-50 border-teal-200">
              <p className="text-sm font-medium text-teal-900 mb-1">
                Your verification is under review
              </p>
              <p className="text-xs text-teal-900">
                We&apos;ll email you within 1-2 business days. Your listings
                won&apos;t appear publicly until your seller account is
                verified.
              </p>
            </Card>
          )}

          {verificationState === "rejected" && (
            <Card className="bg-danger-bg border-danger/30">
              <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
                <div className="flex-1">
                  <p className="text-sm font-medium text-danger-text mb-1">
                    Verification not approved
                  </p>
                  {rejectionReason && (
                    <p className="text-xs text-danger-text mb-2">
                      Reason: {rejectionReason}
                    </p>
                  )}
                  <p className="text-xs text-danger-text">
                    Your listings won&apos;t appear publicly until your seller
                    account is verified. Resubmit with corrections.
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
        </div>
      </Container>
    );
  }

  // Phase E Stage 2.A: business is verified — now require phone verification
  // before listing creation. Sequential gate (business first above, phone
  // second) so a seller mid-business-review isn't also phone-nagged. Redirects
  // to /verify-phone?next=/listings/new if unverified.
  await requirePhoneVerified(supabase, user.id, "/listings/new", {
    required: true,
    reason: "listings",
  });

  const [{ data: categories }, { data: statesRaw }] = await Promise.all([
    supabase
      .from("categories")
      // slug + parent_id are needed by CategorySpecFields to resolve which
      // spec schema to render for the selected category.
      // supports_inventory (E.2.17.0) drives the conditional quantity
      // field on NewListingForm.
      .select("id, name, slug, parent_id, supports_inventory")
      .order("sort_order", { ascending: true }),
    // D-157: new-listing state dropdown shows launch states only. Select
    // `slug` here so filterToLaunchStates can identify rows; strip below.
    supabase
      .from("nigerian_states")
      .select("id, name, slug")
      .order("name", { ascending: true }),
  ]);

  const states = filterToLaunchStates(statesRaw ?? []).map(({ id, name }) => ({
    id,
    name,
  }));

  return (
    <Container size="narrow">
      <div className="py-8 sm:py-12 max-w-2xl mx-auto">
        <div className="mb-2 text-sm text-ink-600">
          <Link href="/dashboard/listings" className="hover:text-ink">
            ← Your listings
          </Link>
        </div>
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-1">
          New listing
        </h1>
        <p className="text-sm text-ink-600 mb-8">
          Share what you&apos;re selling. Real prices, no haggling games.
        </p>
        <Card>
          <NewListingForm
            action={createListingAction}
            categories={categories ?? []}
            states={states}
            businessId={business.id}
          />
        </Card>
      </div>
    </Container>
  );
}
