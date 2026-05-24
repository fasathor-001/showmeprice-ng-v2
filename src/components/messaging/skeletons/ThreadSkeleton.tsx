// Stage 2.B Commit 6 — K-043 thread skeleton.
//
// Matches ThreadHeader + MessageThread + MessageComposer geometry. Visible
// while the Suspense boundary in `/messages/[conversationId]/page.tsx` is
// awaiting the conversation context / messages / profile fetches.

function BubbleSkeleton({
  side,
  widthClass,
}: {
  side: "left" | "right";
  widthClass: string;
}) {
  const align = side === "right" ? "justify-end" : "justify-start";
  return (
    <div className={`flex ${align} mt-3`}>
      <div className="flex flex-col max-w-[75%] sm:max-w-[60%]">
        <div
          className={`rounded-2xl px-4 py-2.5 ${widthClass} h-9 bg-neutral-200`}
        />
        <div className="h-3 w-12 bg-neutral-200 rounded mt-1 px-1" />
      </div>
    </div>
  );
}

export function ThreadSkeleton() {
  return (
    <div className="flex flex-col h-full animate-pulse" aria-busy="true">
      {/* ThreadHeader placeholder — back chevron + name row, then listing strip. */}
      <div className="bg-white border-b border-neutral-200 shrink-0">
        <div className="px-2 sm:px-4 py-1 flex items-center gap-2 min-w-0">
          <div className="w-11 h-11 rounded-lg shrink-0 lg:hidden" />
          <div className="flex items-center gap-2 min-w-0 py-2">
            <div className="h-5 w-32 bg-neutral-200 rounded" />
          </div>
        </div>
        <div className="px-3 sm:px-6 py-2 border-t border-neutral-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-lg bg-neutral-200 shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 w-3/4 bg-neutral-200 rounded" />
              <div className="h-3 w-1/3 bg-neutral-200 rounded" />
            </div>
          </div>
        </div>
      </div>

      {/* MessageThread placeholder — alternating bubbles with mixed widths. */}
      <div className="flex-1 overflow-hidden min-h-0 px-3 sm:px-6 py-4">
        <BubbleSkeleton side="left" widthClass="w-40" />
        <BubbleSkeleton side="right" widthClass="w-52" />
        <BubbleSkeleton side="left" widthClass="w-32" />
        <BubbleSkeleton side="right" widthClass="w-44" />
      </div>

      {/* MessageComposer placeholder — textarea + send button row. */}
      <div className="px-3 sm:px-6 py-3 border-t border-neutral-200 bg-white shrink-0">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-h-[40px] h-10 rounded-xl bg-neutral-200" />
          <div className="h-11 w-16 rounded-lg bg-neutral-200" />
        </div>
      </div>
    </div>
  );
}
