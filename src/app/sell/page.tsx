import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Badge, Card, ToastFromSearchParams } from "@/components/ui";
import { BecomeSellerForm } from "./BecomeSellerForm";
import { ManageBusinessForm } from "./ManageBusinessForm";

export const runtime = "edge";

export default async function SellPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/sell");

  const [{ data: business }, { data: states }] = await Promise.all([
    supabase
      .from("businesses")
      .select(
        "id, business_name, description, state_id, verification_status, rejection_reason"
      )
      .eq("owner_id", user.id)
      .maybeSingle(),
    supabase
      .from("nigerian_states")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);

  if (!business) {
    return (
      <Container size="narrow">
        <ToastFromSearchParams />
        <div className="py-12 sm:py-16 max-w-xl mx-auto">
          <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-2 text-center">
            Sell on ShowMePrice
          </h1>
          <p className="text-sm text-ink-600 text-center mb-8">
            Tell us about your business. Verification (ID, address, NIN) happens
            next so buyers know you&apos;re real.
          </p>
          <Card>
            <BecomeSellerForm states={states ?? []} />
          </Card>
          <p className="mt-6 text-xs text-ink-400 text-center">
            By creating a seller account, you agree to honour the prices you post
            and respond to buyer messages within 48 hours.
          </p>
        </div>
      </Container>
    );
  }

  const needsVerificationCta =
    business.verification_status === "unsubmitted" ||
    business.verification_status === "rejected";

  return (
    <Container size="narrow">
      <ToastFromSearchParams />
      <div className="py-8 sm:py-12 max-w-2xl mx-auto">
        <div className="mb-2 text-sm text-ink-600">
          <Link href="/dashboard" className="hover:text-ink">
            ← Dashboard
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-medium text-ink">
            Your business
          </h1>
          {business.verification_status === "verified" && (
            <Badge variant="verified">Verified</Badge>
          )}
          {business.verification_status === "pending" && (
            <Badge variant="warning">Pending review</Badge>
          )}
          {business.verification_status === "rejected" && (
            <Badge variant="danger">Rejected</Badge>
          )}
          {business.verification_status === "unsubmitted" && (
            <Badge variant="warning">Verification needed</Badge>
          )}
        </div>
        <p className="text-sm text-ink-600 mb-6">
          Manage your business profile. Verification status updates here.
        </p>

        {needsVerificationCta && (
          <Card className="mb-4 bg-warning-bg border-warning/30">
            <div className="flex items-start justify-between gap-3 flex-col sm:flex-row">
              <div className="flex-1">
                <p className="text-sm font-medium text-warning-text mb-1">
                  {business.verification_status === "rejected"
                    ? "Verification rejected — please resubmit"
                    : "Verify your account to publish listings"}
                </p>
                {business.verification_status === "rejected" &&
                  business.rejection_reason && (
                    <p className="text-xs text-warning-text">
                      Reason: {business.rejection_reason}
                    </p>
                  )}
                {business.verification_status === "unsubmitted" && (
                  <p className="text-xs text-warning-text">
                    Listings stay hidden from buyers until your account is verified.
                  </p>
                )}
              </div>
              <Link
                href="/sell/verify"
                className="inline-flex items-center justify-center bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700"
              >
                {business.verification_status === "rejected"
                  ? "Resubmit"
                  : "Start verification"}
              </Link>
            </div>
          </Card>
        )}

        <Card>
          <ManageBusinessForm
            business={{
              business_name: business.business_name,
              description: business.description,
              state_id: business.state_id,
            }}
            states={states ?? []}
          />
        </Card>
      </div>
    </Container>
  );
}
