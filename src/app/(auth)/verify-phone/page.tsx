import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Card, ToastFromSearchParams } from "@/components/ui";
import { VerifyPhoneForm } from "./VerifyPhoneForm";

export const runtime = "edge";

// Validate the return-to destination: must be an app-relative path, never a
// protocol-relative ("//evil.com") or absolute URL (open-redirect guard).
function safeNext(raw: string | undefined): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/dashboard";
}

export default async function VerifyPhonePage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = safeNext(searchParams.next);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(`/verify-phone?next=${next}`)}`,
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("phone, verification_status")
    .eq("id", user.id)
    .maybeSingle();

  // No phone on file — nothing to verify here; send them home.
  if (!profile?.phone) redirect("/dashboard");
  // Already verified — skip the form entirely (mirrors the action short-circuit).
  if ((profile.verification_status ?? []).includes("phone_verified")) {
    redirect(next);
  }

  return (
    <Container size="narrow">
      <ToastFromSearchParams />
      <div className="py-12 sm:py-16 max-w-md mx-auto">
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-2 text-center">
          Verify your phone
        </h1>
        <p className="text-sm text-ink-600 text-center mb-8">
          We will text a 6-digit code to confirm your number. Verifying helps
          buyers and sellers trust each other.
        </p>
        <Card>
          <VerifyPhoneForm phone={profile.phone} next={next} />
        </Card>
      </div>
    </Container>
  );
}
