import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const runtime = "edge";

export default async function ResetPasswordPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only authenticated users (arrived via the recovery callback) can set a new
  // password. Middleware also protects this route; this guard is defense in depth.
  if (!user) {
    redirect("/sign-in?error=reset-no-session");
  }

  return (
    <Container size="narrow">
      <div className="py-12 sm:py-16 max-w-md mx-auto">
        <h1 className="text-2xl font-medium text-ink mb-2 text-center">
          Set a new password
        </h1>
        <p className="text-sm text-ink-600 text-center mb-8">
          Choose a strong password you&apos;ll remember. At least 8 characters.
        </p>
        <ResetPasswordForm />
      </div>
    </Container>
  );
}
