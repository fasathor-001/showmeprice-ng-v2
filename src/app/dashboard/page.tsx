import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Card, ToastFromSearchParams } from "@/components/ui";
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
      .select("display_name, whatsapp_number")
      .eq("id", user.id)
      .single(),
    supabase
      .from("businesses")
      .select("id, verification_status")
      .eq("owner_id", user.id)
      .maybeSingle(),
  ]);

  const displayName = profile?.display_name || user.email?.split("@")[0] || "there";
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
            {profile?.whatsapp_number && (
              <p className="text-xs text-ink-600">
                WhatsApp: +{profile.whatsapp_number}
              </p>
            )}
          </Card>

          {hasBusiness ? (
            <Card>
              <h2 className="text-sm font-medium text-ink mb-1">Your business</h2>
              <p className="text-xs text-ink-600 mb-3">
                {business.verification_status === "verified"
                  ? "Manage your listings and business profile."
                  : "Finish verification to publish your listings."}
              </p>
              <div className="flex flex-col gap-2">
                <Link
                  href="/dashboard/listings"
                  className="text-sm text-teal-700 hover:text-teal-900 font-medium"
                >
                  Your listings →
                </Link>
                <Link
                  href="/sell"
                  className="text-sm text-teal-700 hover:text-teal-900 font-medium"
                >
                  Manage business →
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
