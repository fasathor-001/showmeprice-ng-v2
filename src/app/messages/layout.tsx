import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { listConversations } from "@/lib/messaging/actions";
import { MessagesShell } from "@/components/messaging/MessagesShell";
import { MessagesShellSkeleton } from "@/components/messaging/skeletons/MessagesShellSkeleton";

export const runtime = "edge";

// Stage 2.B Commit 5 — /messages/* route-segment layout.
// Commit 6 K-043: wrapped conversation-list fetch in a Suspense boundary
// with MessagesShellSkeleton fallback so users on slow Nigerian mobile
// connections see an animate-pulse skeleton structure instead of a blank
// viewport during the initial DB roundtrip.
//
// ARCHITECTURE (per surface findings B in Commit 5 + C in Commit 6):
// - Server Component layout: fetches the user's initial conversation list
//   inside a Suspense-deferred async component. Passes to the client shell
//   which owns realtime.
// - All /messages/* routes inherit the shell's fixed-fullheight container.
//   Footer is hidden across the entire messaging surface — D-121 trade-off
//   accepted (matches WhatsApp Web / Telegram Web).
// - Mobile: shell collapses to single-column (aside OR main, not both).
//   Desktop (lg+): split-pane (aside w-96 + main flex-1).
// - URL `/messages/[id]` deep-linking works as today.

export default async function MessagesLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Auth check first (fast — uses session cookie). Done outside the Suspense
  // so unauthenticated requests redirect immediately without a skeleton flash.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/messages");

  return (
    <Suspense fallback={<MessagesShellSkeleton />}>
      <ShellWithData userId={user.id}>{children}</ShellWithData>
    </Suspense>
  );
}

async function ShellWithData({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const result = await listConversations("all", 20);
  if (result.error === "Unauthorized") {
    redirect("/sign-in?next=/messages");
  }

  return (
    <MessagesShell
      userId={userId}
      initialConversations={result.conversations ?? []}
      initialNextCursor={result.nextCursor ?? null}
    >
      {children}
    </MessagesShell>
  );
}
