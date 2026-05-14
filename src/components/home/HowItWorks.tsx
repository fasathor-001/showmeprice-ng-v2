import { Container } from "@/components/layout";

const steps = [
  {
    n: 1,
    title: "Browse with real prices",
    body: "Every listing shows the actual price. No more 'DM for price' or back-and-forth.",
  },
  {
    n: 2,
    title: "See verified sellers",
    body: "Every seller is verified — ID checked, business confirmed, bank account on file.",
  },
  {
    n: 3,
    title: "Chat directly on WhatsApp",
    body: "Tap once to message the seller. No middleman, no fees, just a direct conversation.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-12 sm:py-16">
      <Container>
        <div className="text-center mb-10 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl font-medium text-ink">How it works</h2>
          <p className="mt-2 text-base text-ink-600">Three steps, no surprises.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {steps.map((step) => (
            <div key={step.n} className="text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-teal-50 text-teal-700 font-medium text-sm mb-4">
                {step.n}
              </div>
              <h3 className="text-base font-medium text-ink mb-2">{step.title}</h3>
              <p className="text-sm text-ink-600 leading-relaxed max-w-xs mx-auto">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
