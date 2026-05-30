import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Badge, Card, ToastFromSearchParams } from "@/components/ui";
import { getVerificationState } from "@/lib/verification";
import { formatNigerianPhone, isPhoneVerified } from "@/lib/auth";
import { SignOutButton } from "./SignOutButton";

export const runtime = "edge";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const [{ data: profile }, { data: business }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, phone, verification_status")
      .eq("id", user.id)
      .single(),
    supabase
      .from("businesses")
      .select("id, verification_status, rejection_reason")
      .eq("owner_id", user.id)
      .maybeSingle(),
  ]);

  // Only fetch the latest seller_verifications row when it'd shift the
  // banner state — verified sellers don't need it.
  let latestSubmission: { status: string } | null = null;
  if (business && business.verification_status !== "verified") {
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

  const displayName =
    profile?.display_name || user.email?.split("@")[0] || "there";
  const hasBusiness = business !== null;

  return (
    <Container>
      <ToastFromSearchParams />
      <div className="py-10 sm:py-14">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-1">
            Welcome, {displayName}.
          </h1>
          <p className="text-sm text-ink-600">Your ShowMePrice dashboard.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
          <Card>
            <h2 className="text-sm font-medium text-ink mb-1">Your account</h2>
            <p className="text-xs text-ink-600 mb-3">{user.email}</p>
            {profile?.phone && (
              <div className="flex items-center gap-2 flex-wrap text-xs text-ink-600">
                <span className="tabular-nums">Phone: {formatNigerianPhone(profile.phone)}</span>
                {isPhoneVerified(profile.verification_status) ? (
                  <Badge variant="verified">Verified</Badge>
                ) : (
                  <Link
                    href="/verify-phone?next=/dashboard"
                    className="text-teal-700 hover:text-teal-900 font-medium"
                  >
                    Verify →
                  </Link>
                )}
              </div>
            )}
          </Card>

          {hasBusiness ? (
            <Card>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="text-sm font-medium text-ink">Your business</h2>
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
                  <Badge variant="warning">Verify</Badge>
                )}
              </div>
              <p className="text-xs text-ink-600 mb-3">
                {verificationState === "verified" &&
                  "Manage your listings and business profile."}
                {verificationState === "pending" &&
                  "We're reviewing your verification (1-2 business days)."}
                {verificationState === "rejected" &&
                  "Verification not approved — resubmit to go live."}
                {verificationState === "unsubmitted" &&
                  "Finish verification to publish your listings."}
              </p>
              <div className="flex flex-col gap-2">
                <Link
                  href="/dashboard/listings"
                  className="text-sm text-teal-700 hover:text-teal-900 font-medium"
                >
                  Your listings →
                </Link>
                {verificationState === "unsubmitted" ||
                verificationState === "rejected" ? (
                  <Link
                    href="/sell/verify"
                    className="text-sm text-teal-700 hover:text-teal-900 font-medium"
                  >
                    {verificationState === "rejected"
                      ? "Resubmit verification →"
                      : "Start verification →"}
                  </Link>
                ) : null}
                <Link
                  href="/sell"
                  className="text-sm text-teal-700 hover:text-teal-900 font-medium"
                >
                  Manage business →
                </Link>
                {/* E.2.18.0 / D-142: dedicated avatar/branding surface
                    separate from the broader business-details edit. */}
                <Link
                  href="/dashboard/business-profile"
                  className="text-sm text-teal-700 hover:text-teal-900 font-medium"
                >
                  Business profile →
                </Link>
              </div>
            </Card>
          ) : (
            <Card>
              <h2 className="text-sm font-medium text-ink mb-1">
                Want to sell on ShowMePrice?
              </h2>
              <p className="text-xs text-ink-600 mb-3">
                Set up your business profile to start listing products.
              </p>
              <Link
                href="/sell"
                className="inline-flex items-center justify-center bg-teal-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-teal-700"
              >
                Become a seller
              </Link>
            </Card>
          )}

          <Card>
            <h2 className="text-sm font-medium text-ink mb-3">Quick actions</h2>
            <SignOutButton />
          </Card>
        </div>

        <p className="mt-8 text-xs text-ink-400">
          More features coming soon — saved listings, contact history, and more.
        </p>
      </div>
    </Container>
  );
}
