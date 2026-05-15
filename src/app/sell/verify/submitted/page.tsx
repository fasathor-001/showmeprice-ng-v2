import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";

export const runtime = "edge";

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export default async function VerificationSubmittedPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/sell/verify/submitted");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, verification_status")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!business) redirect("/sell");
  if (business.verification_status === "verified") {
    redirect("/dashboard/listings");
  }

  // Latest submission must be pending AND submitted in the last 24h, otherwise
  // this page is stale (user arrived via bookmark or stale link).
  const { data: submissions } = await supabase
    .from("seller_verifications")
    .select("id, status, submitted_at")
    .eq("business_id", business.id)
    .order("submitted_at", { ascending: false });

  const rows = submissions ?? [];
  const latest = rows[0];

  if (!latest || latest.status !== "pending") redirect("/sell/verify");

  const submittedAt = new Date(latest.submitted_at).getTime();
  if (Number.isNaN(submittedAt) || Date.now() - submittedAt > RECENT_WINDOW_MS) {
    redirect("/sell/verify");
  }

  const isResubmission = rows.length > 1;

  return (
    <Container size="narrow">
      <div className="py-12 sm:py-16 max-w-md mx-auto">
        <h1 className="text-2xl font-medium text-ink mb-2 text-center">
          {isResubmission
            ? "Your resubmission is under review"
            : "Your verification is under review"}
        </h1>
        <p className="text-sm text-ink-600 text-center mb-8">Thank you.</p>

        <div className="bg-verified-bg border border-verified/30 text-verified-text text-sm px-4 py-4 rounded-lg space-y-2">
          {isResubmission ? (
            <>
              <p className="font-medium">
                We&apos;ve received your updated verification.
              </p>
              <p className="text-verified-text/90">
                We&apos;ll review the new documents within 1-2 business days
                and email you when complete.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">
                We&apos;ve received your verification documents.
              </p>
              <p className="text-verified-text/90">
                We&apos;ll review them within 1-2 business days. You&apos;ll
                receive an email at {user.email} when your account is approved.
                While you wait, you can browse other listings on the marketplace.
              </p>
            </>
          )}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center bg-teal-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-teal-700"
          >
            Return to dashboard
          </Link>
          {!isResubmission && (
            <Link
              href="/marketplace"
              className="inline-flex items-center justify-center bg-white border border-neutral-300 text-ink text-sm font-medium px-4 py-2.5 rounded-lg hover:border-neutral-400"
            >
              Browse marketplace
            </Link>
          )}
        </div>
      </div>
    </Container>
  );
}
