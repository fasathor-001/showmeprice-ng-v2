import Link from "next/link";
import { Button } from "@/components/ui";
import { Container } from "./Container";

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-neutral-200">
      <Container>
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center text-lg font-medium">
            <span className="text-ink">ShowMePrice</span>
            <span className="text-teal-600">.ng</span>
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm text-ink-600">
            <Link href="/marketplace" className="hover:text-ink transition-colors">
              Browse
            </Link>
            <Link href="/categories" className="hover:text-ink transition-colors">
              Categories
            </Link>
            <Link href="/sell" className="hover:text-ink transition-colors">
              Sell on ShowMePrice
            </Link>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/sign-in"
              className="hidden sm:inline-flex items-center text-sm text-ink-600 hover:text-ink h-9 px-3 transition-colors"
            >
              Sign in
            </Link>
            <Link href="/sign-up">
              <Button variant="primary" size="sm">
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </Container>
    </header>
  );
}
