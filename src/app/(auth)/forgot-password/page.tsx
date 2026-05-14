import Link from "next/link";
import { Container } from "@/components/layout";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const runtime = "edge";

export default function ForgotPasswordPage() {
  return (
    <Container size="narrow">
      <div className="py-12 sm:py-16 max-w-md mx-auto">
        <h1 className="text-2xl font-medium text-ink mb-2 text-center">
          Reset your password
        </h1>
        <p className="text-sm text-ink-600 text-center mb-8">
          We&apos;ll send you a link to set a new password.
        </p>
        <ForgotPasswordForm />
        <p className="mt-6 text-sm text-ink-600 text-center">
          Remember your password?{" "}
          <Link href="/sign-in" className="text-teal-700 hover:text-teal-900 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </Container>
  );
}
