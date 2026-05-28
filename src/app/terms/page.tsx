'use client';

import Link from 'next/link';

export const runtime = 'edge';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">Terms of Service</h1>
          <p className="text-sm text-slate-500">Last updated: 28 May 2026</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="space-y-8 text-slate-700">
          <section>
            <p className="leading-relaxed">
              ShowMePrice (&quot;ShowMePrice&quot;, &quot;we&quot;, &quot;us&quot;) operates a trust-first marketplace for buyers
              and sellers in Nigeria. ShowMePrice is currently in private early access. By using the platform, you agree to these
              terms.
            </p>
            <p className="leading-relaxed mt-4">
              These terms are written in plain language for our early-access period and may be updated as the platform develops.
              We will update the date above when changes are made.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">1. What ShowMePrice is</h2>
            <p className="leading-relaxed">
              ShowMePrice is a platform where verified sellers list products with real prices, and buyers can browse listings,
              see seller verification signals, and message sellers before deciding to buy.
            </p>
            <p className="leading-relaxed mt-3">
              ShowMePrice is a listing and communication platform. We are not a party to any transaction between a buyer and a
              seller.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">2. We do not hold or process payments</h2>
            <p className="leading-relaxed">
              ShowMePrice does not hold, process, or escrow money. Buyers and sellers arrange payment directly between themselves,
              using whatever method they agree on. We do not take a cut of sales during early access.
            </p>
            <p className="leading-relaxed mt-3">
              Because we are not part of the payment, any payment dispute is between the buyer and the seller. We are not
              responsible for losses arising from a transaction.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">3. Accounts and verification</h2>
            <p className="leading-relaxed">
              To use ShowMePrice, you create an account using a phone number. Sellers complete additional verification, which may
              include phone, identity, and address checks.
            </p>
            <p className="leading-relaxed mt-3">
              Verification confirms that a seller is a real, contactable person. It does not guarantee the quality, legality, or
              accuracy of their listings, nor does it guarantee their conduct in any transaction.
            </p>
            <p className="leading-relaxed mt-3">
              You are responsible for keeping your account details accurate and for activity that happens under your account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">4. Acceptable use</h2>
            <p className="leading-relaxed mb-3">You agree not to use ShowMePrice to:</p>
            <ul className="list-disc list-inside space-y-2 text-slate-700">
              <li>List illegal items or items you do not have the right to sell</li>
              <li>Post false, misleading, or fraudulent listings</li>
              <li>Harass, threaten, or deceive other users</li>
              <li>Attempt to interfere with or misuse the platform</li>
            </ul>
            <p className="leading-relaxed mt-3">
              We may remove listings or suspend accounts that break these terms, at our discretion, particularly to protect other
              users.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">5. Buyer responsibility</h2>
            <p className="leading-relaxed">
              Buyers should use normal judgment before paying for or collecting any item. This includes asking questions, confirming
              details, meeting in safe public places where possible, and being cautious with payment.
            </p>
            <p className="leading-relaxed mt-3">
              Always confirm the item, seller, price, condition, and payment method before completing any transaction.
            </p>
            <p className="leading-relaxed mt-3">
              ShowMePrice provides verification signals and reporting tools to help, but the decision to transact is yours.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">6. Reporting</h2>
            <p className="leading-relaxed">
              If you see a listing or user that seems suspicious, you can report it through the platform. We review reports and take
              action where appropriate.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">7. Availability</h2>
            <p className="leading-relaxed">
              ShowMePrice is in early access. The platform may change, pause, or have interruptions. We do not guarantee uninterrupted
              availability during this period.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">8. Limitation of liability</h2>
            <p className="leading-relaxed">
              To the extent permitted by Nigerian law, ShowMePrice is not liable for losses arising from transactions between users,
              from reliance on listings, or from interruptions to the platform during early access.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">9. Changes to these terms</h2>
            <p className="leading-relaxed">
              We may update these terms as the platform develops. Continued use after an update means you accept the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">10. Contact</h2>
            <p className="leading-relaxed">
              Questions about these terms can be sent to{' '}
              <a href="mailto:admin@showmeprice.ng" className="text-teal-600 hover:text-teal-700 font-medium">
                admin@showmeprice.ng
              </a>
              .
            </p>
          </section>

          <section className="bg-slate-100 rounded-lg border border-slate-200 p-6 mt-8">
            <p className="text-slate-700 leading-relaxed">
              These early-access terms are provided in good faith and in plain language. They will be reviewed and expanded as
              ShowMePrice grows.
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
