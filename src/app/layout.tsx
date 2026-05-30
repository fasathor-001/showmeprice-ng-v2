import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Header, Footer } from "@/components/layout";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "ShowMePrice.ng — Nigeria's verified marketplace",
  description:
    "Real prices, verified sellers, one tap to chat. Skip the 'DM for price' frustration on Nigeria's marketplace where every listing has a price and every seller is verified.",
  icons: {
    // Feature I.1: full favicon set across browser eras. Modern
    // browsers pick the SVG (sharp at every zoom); older ones fall
    // back to the 96×96 PNG. Apple touch icon points at the 180×180
    // PNG generated for the PWA (better iOS support than an SVG —
    // some iOS versions silently ignore SVG apple-touch icons).
    // `shortcut` resolves to favicon.ico for legacy browsers / Windows
    // pinned-site contexts.
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
  // Feature I — Phase 1 PWA. Next renders manifest.ts to
  // /manifest.webmanifest at build time; this metadata field emits
  // the <link rel="manifest"> so browsers (and Bubblewrap at Phase 2)
  // can discover it.
  manifest: "/manifest.webmanifest",
  // iOS PWA support — investigation §8. `capable` opts the app into
  // standalone mode on Add-to-Home-Screen; `title` is the short label
  // shown under the home-screen icon; `statusBarStyle: "default"`
  // renders a light status bar matching the white background.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ShowMePrice",
  },
};

// Feature I — Phase 1. Next 14 wants viewport/themeColor in a
// separate `viewport` export (was deprecated from `metadata` in 14.0).
// Matches Tailwind teal-600 — same accent used on primary CTAs, the
// hero eyebrow, and the verified-badge surface.
export const viewport: Viewport = {
  themeColor: "#0d9488",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        {/* Feature I — Phase 1. Registers /sw.js on mount. Mounted
            last so it doesn't block visible content rendering. */}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
