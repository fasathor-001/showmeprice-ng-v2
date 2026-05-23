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
          {/* Commit 5.2 — square chat glyph, matches the header Messages
              icon. Same SVG path as MessagesIconWithBadge to keep the
              messaging surface visually consistent. */}
          <svg
            viewBox="0 0 24 24"
            className="w-8 h-8 text-teal-600"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
