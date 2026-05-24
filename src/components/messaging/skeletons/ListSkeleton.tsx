// Stage 2.B Commit 6 — K-043 sidebar skeleton.
//
// Geometry MUST match ConversationRow 1:1 — same widths, heights, padding —
// so the layout doesn't shift when real data replaces the skeleton (avoids
// CLS, which feels broken even though it's "just loading").
//
// Visible when the Suspense boundary in `/messages/layout.tsx` is awaiting
// `listConversations`. Animation: Tailwind's animate-pulse on neutral-200
// rectangles — subtle, professional, matches the rest of the Skeleton
// primitives in src/components/ui.
//
// Six placeholder rows fits the typical sidebar viewport above the fold
// on both mobile and lg+. Below the fold it doesn't matter — once data
// loads the real list takes over.

function SkeletonRow() {
  return (
    <div className="flex items-start gap-3 px-3 py-3 sm:px-4 border-b border-neutral-100">
      {/* Thumbnail — matches ConversationRow's w-14 h-14 rounded-lg. */}
      <div className="w-14 h-14 rounded-lg bg-neutral-200 shrink-0" />
      {/* Main column: name (text-base ≈ 24px line), preview (text-sm ≈ 20px line),
          and the third sub-line (last-active + listing). Matches the 3-line layout
          in ConversationRow. */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-4 bg-neutral-200 rounded w-3/4" />
        <div className="h-3.5 bg-neutral-200 rounded w-11/12" />
        <div className="h-3 bg-neutral-200 rounded w-2/3" />
      </div>
      {/* Right column: time chip (text-xs ≈ 16px line). */}
      <div className="shrink-0">
        <div className="h-3 w-10 bg-neutral-200 rounded" />
      </div>
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="flex flex-col h-full animate-pulse" aria-busy="true">
      {/* Sticky header — matches SidebarConversationList's heading bar. */}
      <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 px-3 sm:px-4 py-3 shrink-0">
        <div className="h-5 w-24 bg-neutral-200 rounded" />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}
