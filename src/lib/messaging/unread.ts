import { createClient } from "@/lib/supabase/server";

// Stage 2.B Commit 5.1 — total unread message count across all of a user's
// conversations. Used by the global Header to drive the red count badge on
// the Messages icon (D-121 reaffirmation: world-class messaging surface
// requires accurate, visible unread counts everywhere, not just per-row).
//
// Two-query implementation:
//   1. Get all conversation IDs where user is a party (RLS scopes
//      automatically — only their own conversations come back).
//   2. Count messages in those conversations where read_at IS NULL and
//      sender ≠ user. Uses the `messages_unread_idx` partial index.
//
// Returns 0 on any failure (silent — the badge should never block page
// render). Caller is expected to be a Server Component on every page (Header
// is global), so this runs frequently — the index keeps it cheap at private-
// beta scale. Future: aggregate cache or counter column if traffic grows.

export async function getUnreadMessagesCount(userId: string): Promise<number> {
  const supabase = createClient();

  const { data: convs, error: convErr } = await supabase
    .from("conversations")
    .select("id")
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

  if (convErr || !convs || convs.length === 0) return 0;

  const ids = convs.map((c) => c.id as string);

  const { count, error: countErr } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .in("conversation_id", ids)
    .is("read_at", null)
    .neq("sender_id", userId);

  if (countErr) return 0;
  return count ?? 0;
}
