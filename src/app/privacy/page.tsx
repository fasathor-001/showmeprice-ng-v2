'use client';

import Link from 'next/link';

export const runtime = 'edge';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">Privacy Policy</h1>
          <p className="text-sm text-slate-500">Last updated: 28 May 2026</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="space-y-8 text-slate-700">
          <section>
            <p className="leading-relaxed">
              This policy explains what information ShowMePrice collects, why, and how we handle it. ShowMePrice is currently in
              private early access. We aim to collect only what we need to run the platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">1. Information we collect</h2>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Account information:</h3>
                <p className="leading-relaxed">
                  When you create an account, we collect your phone number and email address.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Seller verification information:</h3>
                <p className="leading-relaxed">
                  If you become a seller, we collect verification details, which may include your name, identity or verification
                  documents you submit, and address information, so we can confirm you are a real, contactable person.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Listing information:</h3>
                <p className="leading-relaxed">
                  Sellers provide details about products they list, including descriptions, prices, photos, and location
                  (city/state).
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Messages:</h3>
                <p className="leading-relaxed">
                  Messages sent between buyers and sellers through the platform are stored so the conversation works and so we can
                  respond to reports of misuse.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Basic technical information:</h3>
                <p className="leading-relaxed">
                  Like most websites, our systems may record basic technical information needed to keep you logged in and to keep
                  the platform secure.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">2. How we use information</h2>
            <p className="leading-relaxed mb-3">We use the information above to:</p>
            <ul className="list-disc list-inside space-y-2 text-slate-700">
              <li>Create and manage your account</li>
              <li>Verify sellers and display verification signals to buyers</li>
              <li>Show listings to buyers</li>
              <li>Enable messaging between buyers and sellers</li>
              <li>Review reports and protect users from misuse</li>
              <li>Keep the platform secure and working</li>
            </ul>
            <p className="leading-relaxed mt-4">We do not sell your personal information.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">3. Payment information</h2>
            <p className="leading-relaxed">
              ShowMePrice does not hold or process payments. We do not collect or store your bank details, card details, or payment
              credentials. Payment is arranged directly between buyers and sellers.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">4. Who can see your information</h2>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Other users:</h3>
                <p className="leading-relaxed">
                  Your seller profile, verification signals, listings, and the messages you send are visible to the users you interact
                  with. Buyers see seller information; sellers see buyer messages.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Service providers:</h3>
                <p className="leading-relaxed">
                  We use trusted service providers to run the platform (for example, hosting and email delivery). They process
                  information only to provide those services.
                </p>
              </div>

              <p className="leading-relaxed">We do not share your personal information with advertisers.</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">5. How we protect information</h2>
            <p className="leading-relaxed">
              We take reasonable steps to protect your information, including secure authentication. No system is perfectly secure,
              but we work to keep your information safe and to limit what we collect.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">6. Your choices</h2>
            <p className="leading-relaxed">
              You can update your account information through the platform. If you want to know what information we hold about you,
              or want your account and information removed, contact us at{' '}
              <a href="mailto:support@showmeprice.ng" className="text-teal-600 hover:text-teal-700 font-medium">
                support@showmeprice.ng
              </a>{' '}
              and we will help.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">7. Data location</h2>
            <p className="leading-relaxed">
              ShowMePrice serves users in Nigeria. Information may be processed using service providers that operate internationally.
              We use providers that apply appropriate security practices.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">8. Changes to this policy</h2>
            <p className="leading-relaxed">
              We may update this policy as the platform develops. We will update the date above when we do.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">9. Contact</h2>
            <p className="leading-relaxed">
              Questions about your privacy or this policy can be sent to{' '}
              <a href="mailto:support@showmeprice.ng" className="text-teal-600 hover:text-teal-700 font-medium">
                support@showmeprice.ng
              </a>
              .
            </p>
          </section>

          <section className="bg-slate-100 rounded-lg border border-slate-200 p-6 mt-8">
            <p className="text-slate-700 leading-relaxed">
              This early-access privacy policy is written in plain language and reflects how ShowMePrice handles information today.
              It will be reviewed and expanded as the platform grows.
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
