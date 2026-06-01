import Link from "next/link";
import { Container } from "./Container";

export function Footer() {
  const currentYear = new Date().getFullYear();

  const platformLinks = [
    { label: "Home", href: "/" },
    { label: "How it works", href: "/#how" },
    { label: "Already invited? Open app", href: "https://app.showmeprice.ng" },
  ];

  const forSellersLinks = [
    { label: "Seller early access", href: "/sell" },
    { label: "How verification works", href: "/sell/verify" },
    { label: "Email our support team", href: "mailto:support@showmeprice.ng" },
  ];

  const helpLegalLinks = [
    { label: "FAQ", href: "/faq" },
    { label: "Terms", href: "/terms" },
    { label: "Privacy", href: "/privacy" },
    { label: "Cookie Policy", href: "/cookie-policy" },
  ];

  const cities = ["Lagos", "Abuja", "Port Harcourt", "Delta — and more"];

  return (
    <footer className="bg-slate-900 text-white mt-24">
      <Container>
        {/* Top Section: Brand Description + Links */}
        <div className="py-12 border-b border-slate-800">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-start">
            {/* Brand */}
            <div>
              <h2 className="text-lg font-bold text-white mb-2">
                ShowMePrice<span className="text-teal-400">.ng</span>
              </h2>
              <p className="text-xs text-slate-400 mb-3 font-medium uppercase tracking-wide">
                Nigeria&apos;s trust-first marketplace.
              </p>
              <p className="text-sm text-slate-300 leading-relaxed">
                Real prices from verified Nigerian sellers, with direct WhatsApp contact when you&apos;re ready.
              </p>
            </div>

            {/* Platform */}
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Platform</h3>
              <ul className="space-y-2">
                {platformLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-300 hover:text-white transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* For Sellers */}
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">For sellers</h3>
              <ul className="space-y-2">
                {forSellersLinks.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith("mailto:") ? (
                      <a
                        href={link.href}
                        className="text-sm text-slate-300 hover:text-white transition-colors duration-200"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-slate-300 hover:text-white transition-colors duration-200"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Help & Legal */}
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Help & legal</h3>
              <ul className="space-y-2">
                {helpLegalLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-300 hover:text-white transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Middle Section: Contact + Cities. Contact block lists every
            reachable channel — email, Nigerian phone line, WhatsApp, and
            the registered Nigerian address — each labeled by purpose so
            the two phone numbers are unambiguous (+234 is the contact
            phone line; +27 is the reachable WhatsApp number — different
            countries, different channels, never to be merged or swapped). */}
        <div className="py-8 border-b border-slate-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Contact */}
            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-300 mb-1">
                  <span className="font-semibold">Email our support team</span>
                </p>
                <a
                  href="mailto:support@showmeprice.ng"
                  className="text-sm text-slate-400 hover:text-white transition-colors duration-200"
                >
                  support@showmeprice.ng
                </a>
              </div>

              <div>
                <p className="text-sm text-slate-300 mb-1">
                  <span className="font-semibold">Phone</span>
                </p>
                <a
                  href="tel:+2347034190006"
                  className="text-sm text-slate-400 hover:text-white transition-colors duration-200"
                >
                  +234 703 419 0006
                </a>
              </div>

              <div>
                <p className="text-sm text-slate-300 mb-1">
                  <span className="font-semibold">WhatsApp</span>
                </p>
                <a
                  href="https://wa.me/27734579333"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-400 hover:text-white transition-colors duration-200"
                >
                  +27 73 457 9333
                </a>
              </div>

              <div>
                <p className="text-sm text-slate-300 mb-1">
                  <span className="font-semibold">Registered address</span>
                </p>
                <p className="text-sm text-slate-400">
                  10 Frank Aliemen Street, Warri, Delta State, Nigeria
                </p>
              </div>
            </div>

            {/* Cities */}
            <div className="text-right">
              <p className="text-sm text-slate-400">{cities.join(" · ")}</p>
            </div>
          </div>
        </div>

        {/* Bottom Section — copyright + registered-entity line. RC + legal
            entity displayed alongside the copyright for legitimacy and to
            satisfy the registered-business display requirements of
            telecoms/SMS-sender-ID approval. */}
        <div className="py-8 text-center text-xs text-slate-400 space-y-1">
          <p>© {currentYear} ShowMePrice.ng. Built for buyers and sellers in Nigeria.</p>
          <p>SHOWMEPRICE-NG LIMITED · RC-9238969</p>
        </div>
      </Container>
    </footer>
  );
}
