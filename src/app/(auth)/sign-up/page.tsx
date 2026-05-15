import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { SignUpForm } from "./SignUpForm";

export const runtime = "edge";

export default async function SignUpPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const { data: states } = await supabase
    .from("nigerian_states")
    .select("id, name")
    .order("name", { ascending: true });

  return (
    <Container size="narrow">
      <div className="py-12 sm:py-16 max-w-md mx-auto">
        <h1 className="text-2xl font-medium text-ink mb-2 text-center">
          Create your account
        </h1>
        <p className="text-sm text-ink-600 text-center mb-8">
          Join ShowMePrice as a buyer or seller.
        </p>
        <SignUpForm states={states ?? []} />
        <p className="mt-6 text-sm text-ink-600 text-center">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-teal-700 hover:text-teal-900 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </Container>
  );
}
