import type { Metadata } from "next";
import Link from "next/link";

// Required by @cloudflare/next-on-pages: every non-static route must declare
// the edge runtime explicitly. This page is server-rendered (uses Metadata
// export) so it's a non-static route. Match the project-wide convention used
// by every other page.tsx (sign-in, dashboard, messages, etc.).
export const runtime = "edge";

// Stage 2.C Commit 8 — TC-023 §6.G stub page.
//
// Target of the "Manage notification preferences" link in transactional
// emails. Full preferences UI lands in Commit 10 alongside TC-024 + TC-025
// (per Frank's approval — pairs with verification-status + welcome emails).
// At MVP this is intentionally minimal — calm copy + nav back to the app.

export const metadata: Metadata = {
  title: "Notification settings · ShowMePrice",
  robots: { index: false, follow: false },
};

export default function NotificationsSettingsPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-neutral-50 py-12 px-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8 text-center shadow-sm">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-teal-50 mb-4">
          <svg
            viewBox="0 0 24 24"
            className="w-6 h-6 text-teal-700"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-ink mb-2">
          Notification settings
        </h1>
        <p className="text-sm text-ink-600 leading-relaxed">
          We&apos;re finishing up the controls for which emails ShowMePrice
          sends you. They&apos;ll land here shortly — until then, all
          transactional emails (new messages, verification updates) stay on.
        </p>
        <div className="mt-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 h-10 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 transition-colors"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
