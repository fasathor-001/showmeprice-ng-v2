import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { SignInForm } from "./SignInForm";

export const runtime = "edge";

export default async function SignInPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <Container size="narrow">
      <div className="py-12 sm:py-16 max-w-md mx-auto">
        <h1 className="text-2xl font-medium text-ink mb-2 text-center">Welcome back</h1>
        <p className="text-sm text-ink-600 text-center mb-8">Sign in to your account.</p>
        <SignInForm />
        <div className="mt-6 flex flex-col gap-3 text-sm text-ink-600 text-center">
          <Link href="/forgot-password" className="text-teal-700 hover:text-teal-900">
            Forgot your password?
          </Link>
          <p>
            New to ShowMePrice?{" "}
            <Link href="/sign-up" className="text-teal-700 hover:text-teal-900 font-medium">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </Container>
  );
}
