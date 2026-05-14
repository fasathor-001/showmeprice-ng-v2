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

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, whatsapp_number")
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name || user.email?.split("@")[0] || "there";

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
