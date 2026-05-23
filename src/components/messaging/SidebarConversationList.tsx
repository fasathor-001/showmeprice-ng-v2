"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import type { ConversationSummary } from "@/lib/messaging/types";
import { ConversationRow } from "./ConversationRow";

// Stage 2.B Commit 5 — client-side sidebar list.
//
// Receives the live conversations array from the shell (which keeps it
// reactive to realtime bumps + optimistic-send confirmations). Pure
// presentation — no fetching or subscription here.
//
// The sticky header inside the sidebar gives mobile + desktop a consistent
// "Messages" label without needing the global Header for context. Matches
// WhatsApp Web's left-pane heading.

interface SidebarConversationListProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
}

export function SidebarConversationList({
  conversations,
  activeConversationId,
}: SidebarConversationListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 px-3 sm:px-4 py-3 shrink-0">
        <h1 className="text-base font-semibold text-ink">Messages</h1>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="px-3 sm:px-4 py-6">
            <Card>
              <div className="text-center py-6 px-4">
                <h2 className="text-sm font-medium text-ink mb-2">
                  No conversations yet
                </h2>
                <p className="text-xs text-ink-600 mb-4">
                  Find a product you like on the marketplace, then tap{" "}
                  <span className="font-medium">Message seller</span>.
                </p>
                <Link
                  href="/marketplace"
                  className="inline-flex items-center text-sm text-teal-700 hover:text-teal-900 font-medium"
                >
                  Browse marketplace →
                </Link>
              </div>
            </Card>
          </div>
        ) : (
          conversations.map((c) => (
            <ConversationRow
              key={c.id}
              conversation={c}
              isActive={c.id === activeConversationId}
            />
          ))
        )}
      </div>
    </div>
  );
}
