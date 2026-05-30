'use client';

import Link from 'next/link';

export const runtime = 'edge';

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">Cookie Policy</h1>
          <p className="text-sm text-slate-500">Last updated: May 2026</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="space-y-8">
          {/* Introduction */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">What are cookies?</h2>
            <p className="text-slate-700 leading-relaxed">
              Cookies are small text files stored on your device when you use ShowMePrice. They help us remember
              information about you across sessions, keep you logged in, and understand how you use the platform.
            </p>
          </section>

          {/* Essential Cookies */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Essential Cookies</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              These cookies are necessary for ShowMePrice to work. They let us:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-700">
              <li>Keep you logged in when you browse the platform</li>
              <li>Remember your user session so you do not have to sign in repeatedly</li>
              <li>Protect your account with security tokens</li>
              <li>Process forms and requests you submit (like sending a message to a seller)</li>
            </ul>
            <p className="text-slate-600 text-sm mt-4">
              You cannot disable these cookies without breaking the platform.
            </p>
          </section>

          {/* Preference Cookies */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Preference Cookies</h2>
            <p className="text-slate-700 leading-relaxed">
              We do not currently use preference cookies. If this changes in the future, we will update this policy.
            </p>
          </section>

          {/* Analytics */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Analytics Cookies</h2>
            <p className="text-slate-700 leading-relaxed">
              We do not currently use analytics cookies. If this changes in the future, we will update this policy.
            </p>
          </section>

          {/* Third-Party */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Third-Party Cookies</h2>
            <p className="text-slate-700 leading-relaxed">
              ShowMePrice may load fonts, map services, or other features from third parties. Those services may place
              their own cookies on your device. We do not control those cookies -- if you have concerns, check their
              privacy policies.
            </p>
          </section>

          {/* How to Manage */}
          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">How to Manage Cookies</h2>
            <p className="text-slate-700 leading-relaxed mb-4">You can control cookies in your browser:</p>
            <ul className="list-disc list-inside space-y-2 text-slate-700">
              <li>
                <strong>Chrome, Edge, Safari, Firefox:</strong> Open Settings → Privacy/Security → Cookies → Block or
                allow specific sites
              </li>
              <li>
                <strong>Clear cookies:</strong> Close your browser or go to Settings → Clear browsing data → Cookies
              </li>
              <li>
                <strong>Do Not Track:</strong> Some browsers have a &quot;Send &apos;Do Not Track&apos; request&quot; option in Settings
              </li>
            </ul>
            <p className="text-slate-600 text-sm mt-4">
              Note: Blocking essential cookies will sign you out and prevent the app from working properly.
            </p>
          </section>

          {/* Contact */}
          <section className="bg-slate-100 rounded-lg border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-3">Questions about cookies?</h2>
            <p className="text-slate-700">
              Email our support team at{' '}
              <a
                href="mailto:support@showmeprice.ng"
                className="text-teal-600 hover:text-teal-700 font-medium"
              >
                support@showmeprice.ng
              </a>
            </p>
          </section>
        </div>
      </div>

      {/* Back Link */}
      <div className="max-w-3xl mx-auto px-6 py-6">
        <Link href="/" className="text-teal-600 hover:text-teal-700 text-sm font-medium">
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
