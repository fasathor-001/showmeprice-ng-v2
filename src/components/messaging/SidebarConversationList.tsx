"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui";
import type { ConversationSummary } from "@/lib/messaging/types";
import { ConversationRow } from "./ConversationRow";
import { useMessagesShell } from "./MessagesShell";

// Stage 2.B Commit 5 (Commit 6 polish: pagination).
//
// Receives the live conversations array from the shell (reactive to realtime
// bumps + optimistic-send confirmations). Now also renders a "Load more"
// affordance at the bottom of the list when more conversations exist beyond
// the loaded page (D-121 polish: WhatsApp / Telegram all paginate sidebar
// conversation lists).

interface SidebarConversationListProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
}

export function SidebarConversationList({
  conversations,
  activeConversationId,
}: SidebarConversationListProps) {
  const { state, loadMoreConversations } = useMessagesShell();
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = state.conversationsNextCursor !== null;

  const handleLoadMore = async () => {
    if (!state.conversationsNextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadMoreConversations(state.conversationsNextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

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
          <>
            {conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                isActive={c.id === activeConversationId}
              />
            ))}
            {hasMore && (
              <div className="px-3 sm:px-4 py-3 text-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="text-sm text-teal-700 hover:text-teal-900 font-medium disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:underline"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
