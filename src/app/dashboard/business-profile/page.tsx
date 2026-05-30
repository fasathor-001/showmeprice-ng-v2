import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Card, ToastFromSearchParams } from "@/components/ui";
import { BusinessAvatarUploader } from "@/components/business/BusinessAvatarUploader";
import { getBusinessAvatarPublicUrl } from "@/lib/storage";

// E.2.18.0 / D-142 Step 2 — seller's avatar management surface.
// Dedicated dashboard page per the investigation's Option B framing —
// keeps avatar editing semantically separated from the wider business-
// details edit on /sell while remaining easy to discover from the
// dashboard's "Your business" card.
//
// Layout:
//   - Header with breadcrumb back to /dashboard.
//   - If verified: render the public shop URL as a clickable link so the
//     seller can preview the result of their changes.
//   - If unverified: avatar can still be uploaded (the work isn't wasted
//     — once verification lands, the avatar is in place), but the public
//     shop URL is gated since the shop page itself 404s for unverified
//     businesses.
//   - Avatar card: uploader + soft guidance copy.
//   - Business details card: link out to /sell for editing name /
//     description / location. Single source of truth — avatar lives
//     here, everything else lives there.

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Business profile · ShowMePrice",
  robots: { index: false, follow: false },
};

export default async function BusinessProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/dashboard/business-profile");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, business_name, logo_path, verification_status")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!business) redirect("/sell");

  const isVerified = business.verification_status === "verified";
  const currentLogoPublicUrl = getBusinessAvatarPublicUrl(
    typeof business.logo_path === "string" ? business.logo_path : null,
  );

  return (
    <Container size="narrow">
      <ToastFromSearchParams />
      <div className="py-8 sm:py-12 max-w-2xl mx-auto">
        <div className="mb-4 text-sm text-ink-600">
          <Link href="/dashboard" className="hover:text-ink">
            ← Dashboard
          </Link>
        </div>

        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-2">
          Business profile
        </h1>
        <p className="text-sm text-ink-600 mb-8">
          {isVerified ? (
            <>
              Your public shop page is at{" "}
              <Link
                href={`/sellers/${business.slug}`}
                className="text-teal-700 hover:text-teal-900 font-medium"
              >
                /sellers/{business.slug}
              </Link>
              .
            </>
          ) : (
            <>Your shop page will be live once your business is verified.</>
          )}
        </p>

        <Card>
          <h2 className="text-sm font-medium text-ink mb-4">Avatar</h2>
          <BusinessAvatarUploader
            businessId={business.id}
            businessName={business.business_name}
            currentLogoPublicUrl={currentLogoPublicUrl}
          />
        </Card>

        <Card className="mt-4">
          <h2 className="text-sm font-medium text-ink mb-2">
            Business details
          </h2>
          <p className="text-xs text-ink-600 mb-3">
            Business name, description, and location are managed on the
            seller setup page.
          </p>
          <Link
            href="/sell"
            className="text-sm text-teal-700 hover:text-teal-900 font-medium"
          >
            Edit business details →
          </Link>
        </Card>
      </div>
    </Container>
  );
}
