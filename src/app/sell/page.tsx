import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Badge, Card, ToastFromSearchParams } from "@/components/ui";
import { getVerificationState } from "@/lib/verification";
import { BecomeSellerForm } from "./BecomeSellerForm";
import { ManageBusinessForm } from "./ManageBusinessForm";

export const runtime = "edge";

export default async function SellPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/sell");

  const [{ data: business }, { data: states }, { data: profile }] =
    await Promise.all([
      supabase
        .from("businesses")
        .select(
          "id, business_name, description, state_id, city_area, verification_status, rejection_reason"
        )
        .eq("owner_id", user.id)
        .maybeSingle(),
      supabase
        .from("nigerian_states")
        .select("id, name")
        .order("name", { ascending: true }),
      // E.2.11 / Stage C: read the user's phone + verification_status so the
      // BecomeSellerForm can pre-fill the "Use my verified number" option.
      // verifiedPhone is non-null ONLY when verification_status includes
      // 'phone_verified' — otherwise the form hides that option and forces
      // the different-number path.
      supabase
        .from("profiles")
        .select("phone, verification_status")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

  if (!business) {
    const isPhoneVerified = (profile?.verification_status ?? []).includes(
      "phone_verified"
    );
    const verifiedPhone =
      isPhoneVerified && profile?.phone ? profile.phone : null;
    return (
      <Container size="narrow">
        <ToastFromSearchParams />
        <div className="py-8 sm:py-12 max-w-xl mx-auto">
          <div className="mb-2 text-sm text-ink-600">
            <Link href="/dashboard" className="hover:text-ink">
              ← Dashboard
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-2 text-center">
            Sell on ShowMePrice
          </h1>
          <p className="text-sm text-ink-600 text-center mb-8">
            Tell us about your business. Verification (ID, address, NIN) happens
            next so buyers know you&apos;re real.
          </p>
          <Card>
            <BecomeSellerForm
              states={states ?? []}
              verifiedPhone={verifiedPhone}
            />
          </Card>
          <p className="mt-6 text-xs text-ink-400 text-center">
            By creating a seller account, you agree to honour the prices you post
            and respond to buyer messages within 48 hours.
          </p>
        </div>
      </Container>
    );
  }

  // Use the latest seller_verifications row to disambiguate 'unsubmitted'
  // (no submission yet) from 'pending' (submitted, awaiting review). Phase
  // A's freeze trigger keeps businesses.verification_status='unsubmitted'
  // during the review window, so reading only that column would mislabel
  // pending sellers.
  const { data: latestSubmission } = await supabase
    .from("seller_verifications")
    .select("status, rejection_reason")
    .eq("business_id", business.id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const verificationState = getVerificationState({ business, latestSubmission });
  const rejectionReason =
    latestSubmission?.rejection_reason ?? business.rejection_reason;

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
          {verificationState === "verified" && (
            <Badge variant="verified">Verified</Badge>
          )}
          {verificationState === "pending" && (
            <Badge variant="teal">Under review</Badge>
          )}
          {verificationState === "rejected" && (
            <Badge variant="danger">Rejected</Badge>
          )}
          {verificationState === "unsubmitted" && (
            <Badge variant="warning">Verification needed</Badge>
          )}
        </div>
        <p className="text-sm text-ink-600 mb-6">
          Manage your business profile. Verification status updates here.
        </p>

        {verificationState === "unsubmitted" && (
          <Card className="mb-4 bg-warning-bg border-warning/30">
            <div className="flex items-start justify-between gap-3 flex-col sm:flex-row">
              <div className="flex-1">
                <p className="text-sm font-medium text-warning-text mb-1">
                  Verify your account to publish listings
                </p>
                <p className="text-xs text-warning-text">
                  Listings stay hidden from buyers until your account is verified.
                </p>
              </div>
              <Link
                href="/sell/verify"
                className="inline-flex items-center justify-center bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700"
              >
                Start verification
              </Link>
            </div>
          </Card>
        )}

        {verificationState === "pending" && (
          <Card className="mb-4 bg-teal-50 border-teal-200">
            <p className="text-sm font-medium text-teal-900 mb-1">
              Your verification is under review
            </p>
            <p className="text-xs text-teal-900">
              We&apos;ll email you within 1-2 business days.
            </p>
          </Card>
        )}

        {verificationState === "rejected" && (
          <Card className="mb-4 bg-danger-bg border-danger/30">
            <div className="flex items-start justify-between gap-3 flex-col sm:flex-row">
              <div className="flex-1">
                <p className="text-sm font-medium text-danger-text mb-1">
                  Verification rejected — please resubmit
                </p>
                {rejectionReason && (
                  <p className="text-xs text-danger-text">
                    Reason: {rejectionReason}
                  </p>
                )}
              </div>
              <Link
                href="/sell/verify"
                className="inline-flex items-center justify-center bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700"
              >
                Resubmit
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
              city_area: business.city_area,
            }}
            states={states ?? []}
          />
        </Card>
      </div>
    </Container>
  );
}
