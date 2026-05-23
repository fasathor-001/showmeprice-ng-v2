"use server";

import { createClient } from "@/lib/supabase/server";

// Stage 2.B Commit 5.4 — client-callable wrapper around the unread-count
// query. Used by MessagesIconWithBadge as a periodic/visibility fallback
// so the count converges to the server's authoritative value even if
// Realtime drops an event. Derives userId from the auth session (NOT from
// a client-provided id) so a malicious caller can't query another user's
// count.
//
// Returns 0 if not signed in (no leak; no auth gate needed). Caller handles
// the result; the function never throws to the client.

export async function fetchMyUnreadMessagesCount(): Promise<number> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: convs, error: convErr } = await supabase
    .from("conversations")
    .select("id")
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`);

  if (convErr || !convs || convs.length === 0) return 0;

  const ids = convs.map((c) => c.id as string);

  const { count, error: countErr } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .in("conversation_id", ids)
    .is("read_at", null)
    .neq("sender_id", user.id);

  if (countErr) return 0;
  return count ?? 0;
}
