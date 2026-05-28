import Link from "next/link";
import { Container } from "./Container";

export function Footer() {
  const currentYear = new Date().getFullYear();

  const platformLinks = [
    { label: "Home", href: "/" },
    { label: "How it works", href: "https://showmeprice.ng/#how" },
    { label: "Already invited? Open app", href: "https://app.showmeprice.ng" },
  ];

  const forSellersLinks = [
    { label: "Seller early access", href: "/sell" },
    { label: "Verification", href: "/sell/verify" },
    { label: "Contact founder", href: "mailto:admin@showmeprice.ng" },
  ];

  const helpLegalLinks = [
    { label: "FAQ", href: "/faq" },
    { label: "Terms", href: "/terms" },
    { label: "Privacy", href: "/privacy" },
    { label: "Cookie Policy", href: "/cookie-policy" },
  ];

  const cities = ["Lagos", "Abuja", "Port Harcourt", "Edo", "Delta"];

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
                Real prices, verified sellers, and safer buyer-seller conversations.
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

        {/* Middle Section: Founder + Cities */}
        <div className="py-8 border-b border-slate-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Founder Contact */}
            <div>
              <p className="text-sm text-slate-300 mb-1">
                <span className="font-semibold">Frank A.</span>
              </p>
              <a
                href="mailto:admin@showmeprice.ng"
                className="text-sm text-slate-400 hover:text-white transition-colors duration-200"
              >
                admin@showmeprice.ng
              </a>
            </div>

            {/* Cities */}
            <div className="text-right">
              <p className="text-sm text-slate-400">{cities.join(" · ")}</p>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="py-8 text-center text-xs text-slate-400">
          <p>© {currentYear} ShowMePrice.ng. Built for buyers and sellers in Nigeria.</p>
        </div>
      </Container>
    </footer>
  );
}
