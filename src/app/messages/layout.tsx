import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { listConversations } from "@/lib/messaging/actions";
import { MessagesShell } from "@/components/messaging/MessagesShell";

export const runtime = "edge";

// Stage 2.B Commit 5 — /messages/* route-segment layout.
//
// ARCHITECTURE (per surface findings B):
// - Server Component layout: fetches the user's initial conversation list
//   once at the layout level (one fetch shared across /messages and
//   /messages/[id]). Passes to the client shell which owns realtime.
// - All /messages/* routes inherit the shell's fixed-fullheight container
//   (lifted from Commit 4.1's per-page layout). Footer is hidden across the
//   entire messaging surface — D-121 trade-off accepted: messaging is its
//   own chat-app visual context, matching WhatsApp Web / Telegram Web.
// - Mobile: shell collapses to single-column (aside OR main, not both).
//   Desktop (lg+): split-pane (aside w-96 + main flex-1).
// - URL `/messages/[id]` deep-linking works as today — segment-driven thread
//   render in the main pane; sidebar persists across segment changes.
//
// Auth check: if no user, redirect to sign-in. Children routes are auth-
// gated as defense-in-depth.

export default async function MessagesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/messages");

  // Initial list — server-rendered for first paint. Realtime layer in the
  // shell keeps it live thereafter.
  const result = await listConversations("all", 20);
  if (result.error === "Unauthorized") {
    redirect("/sign-in?next=/messages");
  }

  return (
    <MessagesShell
      userId={user.id}
      initialConversations={result.conversations ?? []}
    >
      {children}
    </MessagesShell>
  );
}
