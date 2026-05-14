import Link from "next/link";
import { Container } from "@/components/layout";
import { Button } from "@/components/ui";

export const runtime = "edge";

export default function NotFound() {
  return (
    <Container size="narrow">
      <div className="py-20 sm:py-28 text-center max-w-md mx-auto">
        <p className="text-sm text-ink-400 mb-2">404</p>
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-3">
          Page not found
        </h1>
        <p className="text-sm text-ink-600 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <Link href="/">
          <Button variant="primary" size="md">
            Go home
          </Button>
        </Link>
      </div>
    </Container>
  );
}
