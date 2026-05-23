import { EmptyThreadPane } from "@/components/messaging/EmptyThreadPane";

export const runtime = "edge";

// Stage 2.B Commit 5 — /messages renders only the desktop "empty right pane"
// content. The conversation list itself moved to the layout's `aside`
// (rendered by SidebarConversationList inside MessagesShell), so this page
// no longer fetches conversations.
//
// Mobile-at-/messages: the layout's `main` is `hidden` (only aside visible),
// so this page's render isn't user-facing. EmptyThreadPane itself contains
// `hidden lg:flex` for the same reason — defensive in case any future
// rendering path hits this content at <lg.
//
// Auth is enforced by the layout (redirects to /sign-in if no user); no
// duplicate check here.
export default function MessagesIndexPage() {
  return <EmptyThreadPane />;
}
