'use client';

import Link from 'next/link';

export default function FAQPage() {
  const faqs = [
    {
      question: 'What is ShowMePrice?',
      answer:
        'ShowMePrice is a marketplace where verified Nigerian sellers post products with real prices, and buyers contact them directly via WhatsApp or phone. We solve the "DM for price" problem by showing prices upfront and verifying sellers through phone, identity, and address checks.',
    },
    {
      question: 'Is ShowMePrice public yet?',
      answer:
        'No. ShowMePrice is in private early access. We are onboarding a small group of verified sellers first in Lagos, Abuja, Port Harcourt, Edo, and Delta. Buyers enter through shared listings or invitation links during this phase.',
    },
    {
      question: 'How does private early access work?',
      answer:
        'We start with sellers. A trusted group of sellers publish verified listings with real prices, photos, and location. Buyers can then browse those listings, message sellers, and meet or arrange payment directly. This lets us build a real seller network before opening broadly to buyers.',
    },
    {
      question: 'How do sellers get verified?',
      answer:
        'Sellers complete a phone number check, identity verification (using a valid ID), and address verification. This is done once during signup. Verification helps buyers trust that the person they are messaging is real.',
    },
    {
      question: 'What does "verified" mean?',
      answer:
        'A verified seller has passed phone, identity, and address checks. This does not mean we guarantee the quality of their products or their honesty in every transaction -- it means the person is real and we have their contact details on file. You should still use normal buyer judgment (ask questions, check reviews/ratings from other buyers if available, meet in safe places).',
    },
    {
      question: 'Does ShowMePrice hold my money?',
      answer:
        'No. ShowMePrice does not hold or process payments. You and the seller arrange payment directly -- cash in person, bank transfer, or another method you both agree on. We do not take a cut of sales during early access.',
    },
    {
      question: 'How do I contact a seller?',
      answer:
        'You can message sellers directly through the app, or tap to reveal their WhatsApp or phone number and contact them outside the app. All conversations in the app show the seller\'s verified status.',
    },
    {
      question: 'What should I check before paying a seller?',
      answer:
        'Check their verification status, ask questions in the app about the product, ask for photos if needed, check if other buyers have left feedback or ratings, and meet in a safe place if buying in person. Never send money before you have agreed on the exact product and price.',
    },
    {
      question: 'How do I report a listing or seller?',
      answer:
        'Tap the three-dot menu on any listing or within a conversation and select "Report." Tell us what is wrong (e.g., misleading photos, scam attempt, illegal item) and we will review it.',
    },
    {
      question: 'How do I contact support?',
      answer:
        'Email Frank (the founder) at admin@showmeprice.ng with questions, bugs, or concerns. Response times may be slower during early access since we are a small team.',
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">Frequently Asked Questions</h1>
          <p className="text-lg text-slate-600">
            Everything you need to know about ShowMePrice during private early access.
          </p>
        </div>
      </div>

      {/* FAQ Content */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="space-y-8">
          {faqs.map((faq, index) => (
            <div key={index} className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-3 text-teal-700">
                {faq.question}
              </h2>
              <p className="text-slate-700 leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="mt-12 bg-slate-100 rounded-lg border border-slate-200 p-8 text-center">
          <h3 className="text-xl font-semibold text-slate-900 mb-2">Can&apos;t find your answer?</h3>
          <p className="text-slate-600 mb-4">
            Email Frank at{' '}
            <a
              href="mailto:admin@showmeprice.ng"
              className="text-teal-600 hover:text-teal-700 font-medium"
            >
              admin@showmeprice.ng
            </a>
          </p>
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
