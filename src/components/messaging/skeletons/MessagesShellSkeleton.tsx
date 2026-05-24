import { ListSkeleton } from "./ListSkeleton";

// Stage 2.B Commit 6 — K-043 full-shell skeleton.
//
// Same fixed-fullheight structure as MessagesShell so the layout doesn't
// shift when the real shell hydrates. Sidebar shows ListSkeleton; main
// pane is a soft neutral-50 placeholder (matches EmptyThreadPane's bg)
// so users on desktop see "something is loading there" without flash.

export function MessagesShellSkeleton() {
  return (
    <div className="fixed left-0 right-0 top-16 z-20 bg-white h-[calc(100dvh-4rem)] lg:flex">
      <aside
        className="flex lg:w-96 lg:flex-shrink-0 lg:border-r lg:border-neutral-200 flex-col w-full h-full overflow-hidden"
        aria-label="Loading conversations"
      >
        <ListSkeleton />
      </aside>
      <main
        className="hidden lg:flex flex-1 min-w-0 flex-col h-full bg-neutral-50"
        aria-hidden="true"
      />
    </div>
  );
}
