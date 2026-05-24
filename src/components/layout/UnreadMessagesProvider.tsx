"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchMyUnreadMessagesCount } from "@/lib/messaging/unread-action";

// Stage 2.B Commit 6 — K-040 closeout via lifted state.
//
// Single client component owns ONE realtime subscription + ONE count state,
// served via context to both consumers (header chat icon + UserMenu avatar
// dot + UserMenu dropdown badge). Replaces the per-component subscription
// in MessagesIconWithBadge from Commit 5.1/5.3/5.4.
//
// Why lift: with K-040 closeout adding an avatar dot, three surfaces want
// the same realtime count. Three independent subscriptions = three websocket
// channels = wasted resources. One subscription, three consumers.
//
// Architecture: same realtime + auth-race + permissive UPDATE detection +
// periodic + visibility-change refetch fallback as Commit 5.4. Just moved
// up the component tree.

interface UnreadMessagesContextValue {
  count: number;
}

const Ctx = createContext<UnreadMessagesContextValue | null>(null);

/**
 * Subscribe to the realtime-tracked unread count.
 * Returns 0 if the provider isn't mounted (signed-out users, etc.).
 */
export function useUnreadMessagesCount(): number {
  const v = useContext(Ctx);
  return v?.count ?? 0;
}

interface MessageRowSubset {
  id?: string;
  sender_id?: string;
  read_at?: string | null;
}

interface UnreadMessagesProviderProps {
  userId: string;
  initialCount: number;
  children: ReactNode;
}

const FALLBACK_REFRESH_INTERVAL_MS = 30_000;

export function UnreadMessagesProvider({
  userId,
  initialCount,
  children,
}: UnreadMessagesProviderProps) {
  const [count, setCount] = useState(initialCount);

  // Re-sync to server-rendered value on navigation (Header re-fetches the
  // count, prop updates flow in here).
  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  // Realtime subscription — primary update path. Auth-race fix from
  // Commit 5.3: explicit setAuth before subscribe. Permissive UPDATE
  // detection from Commit 5.4: tolerates missing payload.old.read_at.
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase
        .channel(`unread-provider-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const row = payload.new as MessageRowSubset | undefined;
            if (process.env.NODE_ENV !== "production") {
              console.log("[UnreadMessagesProvider] INSERT received:", row);
            }
            if (!row || row.sender_id === userId) return;
            setCount((c) => c + 1);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages" },
          (payload) => {
            const oldRow = payload.old as MessageRowSubset | undefined;
            const newRow = payload.new as MessageRowSubset | undefined;
            if (process.env.NODE_ENV !== "production") {
              console.log("[UnreadMessagesProvider] UPDATE received:", {
                old: oldRow,
                new: newRow,
              });
            }
            if (!newRow || newRow.sender_id === userId) return;
            const wasUnread = !oldRow?.read_at;
            const nowRead = !!newRow.read_at;
            if (wasUnread && nowRead) {
              setCount((c) => Math.max(0, c - 1));
            }
          },
        )
        .subscribe((status) => {
          if (process.env.NODE_ENV !== "production") {
            console.log(
              "[UnreadMessagesProvider] realtime subscription status:",
              status,
            );
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [userId]);

  // Fallback refetch — periodic + on visibility change. Safety net so the
  // count converges to the server's truth within 30s even if realtime drops
  // events.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const fresh = await fetchMyUnreadMessagesCount();
        if (!cancelled) setCount(fresh);
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[UnreadMessagesProvider] refetch failed:", err);
        }
      }
    };

    const visHandler = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", visHandler);
    const interval = setInterval(refresh, FALLBACK_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", visHandler);
      clearInterval(interval);
    };
  }, [userId]);

  return <Ctx.Provider value={{ count }}>{children}</Ctx.Provider>;
}
