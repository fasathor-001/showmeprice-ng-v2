import { Container } from "@/components/layout";

// Feature M — homepage trust explanation.
//
// Composed into src/app/page.tsx after <HowItWorks /> and before the
// root-layout <Footer />. Server component, no DB, no auth, no client
// hooks. Pure copy + layout.
//
// Locked copy contract (per Feature M directive):
//   - Section title: "Why buyers trust ShowMePrice"
//   - 5 sections with verbatim body strings — NO agent variation
//   - Section 1 ("Verified sellers") includes the seller-side
//     reassurance line appended as a second sentence in the same body
//   - Section 5 ("What ShowMePrice does not promise") is the legally
//     + reputationally load-bearing honest-framing block
//
// No-overpromise rule (locked): "Verified seller" means the seller
// passed account, contact, and admin review. It does NOT mean
// ShowMePrice has inspected every product. No copy in this file
// implies product inspection, quality control, escrow, mediation,
// refunds, or transaction guarantees.
//
// Visual choices locked at Phase 1 review:
//   - Sections 1-4 in a 2x2 grid (md:grid-cols-2) — absorbs Section 1's
//     two-sentence asymmetry and visually differentiates from
//     HowItWorks's 3-up rhythm.
//   - No numbered circles — these are facets of trust, not procedural
//     steps. Heading-only treatment with a small teal accent.
//   - Section 5: neutral-50 background panel with subtle padding for
//     gentle visual separation. No warning colors, no danger language.

export function BuyerTrust() {
  return (
    <section className="py-12 sm:py-16">
      <Container>
        <div className="text-center mb-10 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl font-medium text-ink">
            Why buyers trust ShowMePrice
          </h2>
        </div>

        {/* Sections 1-4 — facets of trust. 2x2 grid on md+, single
            column on mobile. text-left so the prose reads naturally
            without a centered visual anchor. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
          <div>
            <h3 className="text-teal-700 font-semibold text-base mb-2">
              Verified sellers
            </h3>
            <p className="text-sm text-ink-600 leading-relaxed">
              Verified sellers have passed ShowMePrice account, contact,
              and admin review before listing publicly. Verified sellers
              stand out because buyers can see they have passed platform
              review.
            </p>
          </div>

          <div>
            <h3 className="text-teal-700 font-semibold text-base mb-2">
              Clear prices
            </h3>
            <p className="text-sm text-ink-600 leading-relaxed">
              See real prices upfront, so you do not have to chase basic
              information.
            </p>
          </div>

          <div>
            <h3 className="text-teal-700 font-semibold text-base mb-2">
              Message sellers safely
            </h3>
            <p className="text-sm text-ink-600 leading-relaxed">
              Message verified sellers through ShowMePrice when you are
              ready.
            </p>
          </div>

          <div>
            <h3 className="text-teal-700 font-semibold text-base mb-2">
              Buy safely
            </h3>
            <p className="text-sm text-ink-600 leading-relaxed">
              Ask questions, inspect where possible, confirm details, and
              avoid paying blindly.
            </p>
          </div>
        </div>

        {/* Section 5 — honest framing of what the platform does NOT
            promise. Neutral-50 panel for gentle visual emphasis. Same
            teal heading accent as Sections 1-4 for consistency; the
            background panel does the differentiation work. Narrower
            max-width than the grid so the paragraph reads as a focused
            statement, not a sprawling block. */}
        <div className="mt-10 sm:mt-12 max-w-3xl mx-auto bg-neutral-50 rounded-xl p-6 sm:p-8">
          <h3 className="text-teal-700 font-semibold text-base mb-2">
            What ShowMePrice does not promise
          </h3>
          <p className="text-sm text-ink-600 leading-relaxed">
            ShowMePrice helps you find verified sellers and clear prices,
            but we do not hold payment, guarantee transactions, or inspect
            every product. Always confirm details before you pay.
          </p>
        </div>
      </Container>
    </section>
  );
}
