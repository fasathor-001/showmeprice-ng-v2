import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Badge, Card } from "@/components/ui";
import { VerificationForm } from "./VerificationForm";

export const runtime = "edge";

export default async function VerifyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/sell/verify");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, business_name, verification_status")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!business) redirect("/sell");
  if (business.verification_status === "verified") {
    redirect("/dashboard/listings");
  }

  // Banner state derives from the latest seller_verifications row (D-035).
  const { data: latestSubmission } = await supabase
    .from("seller_verifications")
    .select("status, rejection_reason, submitted_at")
    .eq("business_id", business.id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hasPendingSubmission = latestSubmission?.status === "pending";
  const wasRejected = latestSubmission?.status === "rejected";

  const { data: states } = await supabase
    .from("nigerian_states")
    .select("id, name")
    .order("name", { ascending: true });

  return (
    <Container size="narrow">
      <div className="py-8 sm:py-12 max-w-2xl mx-auto">
        <div className="mb-2 text-sm text-ink-600">
          <Link href="/sell" className="hover:text-ink">
            ← Your business
          </Link>
        </div>
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-2">
          Verify your seller account
        </h1>
        <p className="text-sm text-ink-600 mb-6">
          We verify every seller so buyers can trust who they&apos;re messaging.
          Review takes 1-2 business days. Your information is stored securely
          and never shared with buyers.
        </p>

        {hasPendingSubmission && (
          <Card className="mb-6">
            <div className="flex items-start gap-3">
              <Badge variant="warning">Pending</Badge>
              <div>
                <p className="text-sm font-medium text-ink">
                  Your verification is being reviewed.
                </p>
                <p className="text-xs text-ink-600 mt-1">
                  Submitted{" "}
                  {latestSubmission?.submitted_at
                    ? new Date(latestSubmission.submitted_at).toLocaleDateString(
                        "en-NG",
                        { year: "numeric", month: "short", day: "numeric" }
                      )
                    : "recently"}
                  . We&apos;ll let you know once approved.
                </p>
              </div>
            </div>
          </Card>
        )}

        {wasRejected && latestSubmission?.rejection_reason && (
          <Card className="mb-6 border-danger/30 bg-danger-bg">
            <div className="flex items-start gap-3">
              <Badge variant="danger">Rejected</Badge>
              <div>
                <p className="text-sm font-medium text-danger-text">
                  Verification not approved
                </p>
                <p className="text-xs text-danger-text mt-1">
                  Reason: {latestSubmission.rejection_reason}
                </p>
                <p className="text-xs text-ink-600 mt-2">
                  Please resubmit with corrections below.
                </p>
              </div>
            </div>
          </Card>
        )}

        {!hasPendingSubmission && (
          <Card>
            <VerificationForm states={states ?? []} userId={user.id} />
          </Card>
        )}

        <p className="mt-6 text-xs text-ink-400 text-center">
          By submitting, you confirm the information is accurate and consent to
          ShowMePrice processing this data per our privacy policy.
        </p>
      </div>
    </Container>
  );
}
