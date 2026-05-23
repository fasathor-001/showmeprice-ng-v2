import Link from "next/link";

// Stage 2.B Commit 5 — desktop split-pane right pane when no conversation
// is selected. Centered vertical layout with a soft chat-bubble illustration,
// instructive heading, and a marketplace link (D-112 trust-positioning copy
// per surface findings J).
//
// Only visible on lg+ (mobile users at /messages see the sidebar full-width
// in `main` while this pane is hidden by the layout's `hidden lg:flex`).

export function EmptyThreadPane() {
  return (
    <div className="hidden lg:flex flex-1 items-center justify-center bg-neutral-50 h-full">
      <div className="flex flex-col items-center text-center px-6 py-12 max-w-md">
        <div
          className="w-16 h-16 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center mb-5"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-8 h-8 text-teal-600"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </div>
        <h2 className="text-lg font-medium text-ink mb-2">
          Select a conversation
        </h2>
        <p className="text-sm text-ink-600 mb-5">
          Tap a chat on the left to see messages, or browse the marketplace to
          find verified sellers near you.
        </p>
        <Link
          href="/marketplace"
          className="text-sm text-teal-700 hover:text-teal-900 font-medium"
        >
          Browse marketplace →
        </Link>
      </div>
    </div>
  );
}
