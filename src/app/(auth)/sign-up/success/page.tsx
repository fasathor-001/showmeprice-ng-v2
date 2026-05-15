import Link from "next/link";
import { Container } from "@/components/layout";

export const runtime = "edge";

interface PageProps {
  searchParams: { type?: string; email?: string };
}

export default function SignUpSuccessPage({ searchParams }: PageProps) {
  const isSeller = searchParams.type === "seller";
  const email = searchParams.email ?? "";

  const headline = "Check your email";
  const lead = email
    ? `We've sent a confirmation link to ${email}.`
    : "We've sent a confirmation link to the email you provided.";
  const next = isSeller
    ? "Click it to activate your account. You'll then be guided to verify your business so you can start listing products."
    : "Click it to activate your account and start browsing.";

  return (
    <Container size="narrow">
      <div className="py-12 sm:py-16 max-w-md mx-auto">
        <h1 className="text-2xl font-medium text-ink mb-2 text-center">{headline}</h1>
        <p className="text-sm text-ink-600 text-center mb-8">
          Your account is almost ready.
        </p>

        <div className="bg-verified-bg border border-verified/30 text-verified-text text-sm px-4 py-4 rounded-lg space-y-2">
          <p className="font-medium">{lead}</p>
          <p className="text-verified-text/90">{next}</p>
        </div>

        <p className="mt-6 text-sm text-ink-600 text-center">
          Didn&apos;t receive it? Check your spam folder, or{" "}
          <Link
            href="/sign-in"
            className="text-teal-700 hover:text-teal-900 font-medium"
          >
            try signing in
          </Link>{" "}
          (we&apos;ll prompt for a new link if needed).
        </p>
      </div>
    </Container>
  );
}
