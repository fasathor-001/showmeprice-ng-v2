import Link from "next/link";
import { Card } from "@/components/ui";
import type { ConversationSummary } from "@/lib/messaging/types";
import { ConversationRow } from "./ConversationRow";

// Commit 2 — wraps the conversation rows with empty state. Server Component.
// Pagination ("Load more") deferred to Commit 6 polish per Question F.

interface ConversationListProps {
  conversations: ConversationSummary[];
  /** Frozen `now` for deterministic SSR — uses Date.now() if omitted. */
  now?: Date;
}

export function ConversationList({ conversations, now }: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <Card>
        <div className="text-center py-8 px-4">
          <h2 className="text-sm font-medium text-ink mb-2">No conversations yet</h2>
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
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      {/* Last row's border-bottom is hidden via :last-child in CSS, but
          inline border-b on each row keeps the markup simple — the bottom
          border of the last row sits flush with the container's border so
          it doesn't look doubled in practice. */}
      {conversations.map((c) => (
        <ConversationRow key={c.id} conversation={c} now={now} />
      ))}
    </div>
  );
}
