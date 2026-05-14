import Link from "next/link";
import { Container } from "./Container";

export function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-neutral-50 mt-16">
      <Container>
        <div className="py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-sm font-medium text-ink mb-3">Marketplace</h3>
            <ul className="space-y-2 text-sm text-ink-600">
              <li>
                <Link href="/marketplace" className="hover:text-ink">
                  Browse
                </Link>
              </li>
              <li>
                <Link href="/categories" className="hover:text-ink">
                  Categories
                </Link>
              </li>
              <li>
                <Link href="/sellers" className="hover:text-ink">
                  Sellers
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-medium text-ink mb-3">For sellers</h3>
            <ul className="space-y-2 text-sm text-ink-600">
              <li>
                <Link href="/sell" className="hover:text-ink">
                  Start selling
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-ink">
                  Pro tier
                </Link>
              </li>
              <li>
                <Link href="/verification" className="hover:text-ink">
                  Get verified
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-medium text-ink mb-3">Help</h3>
            <ul className="space-y-2 text-sm text-ink-600">
              <li>
                <Link href="/how-it-works" className="hover:text-ink">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/safety" className="hover:text-ink">
                  Safety tips
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-ink">
                  Contact us
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-medium text-ink mb-3">Company</h3>
            <ul className="space-y-2 text-sm text-ink-600">
              <li>
                <Link href="/about" className="hover:text-ink">
                  About
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-ink">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-ink">
                  Privacy
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="py-6 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink-600">
          <p>© 2026 ShowMePrice.ng — Nigeria&apos;s verified marketplace.</p>
          <p>Made for buyers and sellers in Nigeria.</p>
        </div>
      </Container>
    </footer>
  );
}
