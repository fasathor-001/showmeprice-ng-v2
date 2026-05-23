"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  makeTempId,
  normalizeMessageRow,
  realtimeReducer,
  type RealtimeState,
  type ThreadMessage,
} from "@/lib/messaging/realtime";
import type {
  ConversationSummary,
  MessageRow,
} from "@/lib/messaging/types";
import { SidebarConversationList } from "./SidebarConversationList";

// Stage 2.B Commit 5 — split-pane shell + realtime owner.
//
// Architecture (per surface findings B):
// - Server-layout fetches initial conversation list, passes here.
// - This component owns:
//     · realtime subscription (single user-scoped channel on messages table)
//     · reducer state for conversations + active thread messages
//     · split-pane CSS layout (lg+ = sidebar + main; <lg = single column)
//     · context provider for descendants (composer, thread)
// - useSelectedLayoutSegment() tells us which conversation is "active" (URL-
//   driven), drives sidebar highlighting + mobile aside/main visibility.
// - Footer is hidden across the entire /messages/* surface — the layout
//   adopts the `position: fixed h-[calc(100dvh-4rem)]` model from Commit 4.1.
//   D-121 trade-off accepted: messaging is its own visual context, matching
//   WhatsApp Web / Telegram Web.

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface MessagesShellContextValue {
  state: RealtimeState;
  /** Tell the shell that this conversation's thread has mounted with these initial messages. */
  seedActive: (conversationId: string, messages: ThreadMessage[]) => void;
  /** Optimistically prepend a temp message; returns the tempId for later swap. */
  optimisticSend: (
    conversationId: string,
    partial: Omit<ThreadMessage, "id" | "createdAt" | "pending">,
  ) => string;
  /** Mark a server-confirmed message — replaces the tempId with the real row. */
  confirmSend: (
    conversationId: string,
    tempId: string,
    real: MessageRow,
  ) => void;
  /** Mark a send as failed — bubble switches to failed-state UI. */
  failSend: (conversationId: string, tempId: string) => void;
  /** User-initiated: drop a failed bubble from the thread. */
  dismissFailed: (conversationId: string, tempId: string) => void;
}

const Ctx = createContext<MessagesShellContextValue | null>(null);

export function useMessagesShell(): MessagesShellContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error(
      "useMessagesShell must be used inside <MessagesShell> (the /messages route's layout).",
    );
  }
  return v;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MessagesShellProps {
  userId: string;
  initialConversations: ConversationSummary[];
  children: ReactNode;
}

export function MessagesShell({
  userId,
  initialConversations,
  children,
}: MessagesShellProps) {
  // Active conversation id from URL: at /messages/[id], segment === [id];
  // at /messages, segment === null.
  const segment = useSelectedLayoutSegment();
  const activeConversationId = segment ?? null;

  const [state, dispatch] = useReducer(realtimeReducer, {
    conversations: initialConversations,
    activeConversationId,
    activeMessages: [],
    activeSeeded: false,
  } satisfies RealtimeState);

  // Sync active conversation id on URL change (also resets active-thread state).
  useEffect(() => {
    dispatch({ type: "SET_ACTIVE", conversationId: activeConversationId });
  }, [activeConversationId]);

  // Single user-scoped realtime subscription. RLS in Supabase Realtime ensures
  // we only get rows the user can see; we filter further client-side based on
  // active state (reducer handles that).
  //
  // Commit 5.3 fix: explicit `supabase.realtime.setAuth(jwt)` BEFORE subscribe
  // so RLS-filtered postgres_changes events deliver. Without this the realtime
  // connection can authenticate as anon (cookie-session-load vs. subscribe
  // race in @supabase/ssr's browser client) and no events arrive — see same
  // fix in MessagesIconWithBadge for the badge counter symptom.
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
        .channel(`messages-realtime-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            if (!row) return;
            dispatch({
              type: "REALTIME_INSERT",
              message: normalizeMessageRow(row),
              currentUserId: userId,
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages" },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            if (!row) return;
            dispatch({
              type: "REALTIME_UPDATE",
              message: normalizeMessageRow(row),
            });
          },
        )
        .subscribe((status) => {
          if (process.env.NODE_ENV !== "production") {
            console.log(
              "[MessagesShell] realtime subscription status:",
              status,
            );
          }
        });
    })();

    return () => {
      cancelled = true;
      // Clean up on unmount/sign-out — channel cleanup + websocket close.
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [userId]);

  // ---- Context actions ----

  const seedActive = useCallback(
    (conversationId: string, messages: ThreadMessage[]) => {
      dispatch({ type: "SEED_ACTIVE", conversationId, messages });
    },
    [],
  );

  const optimisticSend = useCallback(
    (
      conversationId: string,
      partial: Omit<ThreadMessage, "id" | "createdAt" | "pending">,
    ) => {
      const tempId = makeTempId();
      const message: ThreadMessage = {
        ...partial,
        id: tempId,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      dispatch({ type: "OPTIMISTIC_ADD", conversationId, message });
      return tempId;
    },
    [],
  );

  const confirmSend = useCallback(
    (conversationId: string, tempId: string, real: MessageRow) => {
      dispatch({
        type: "SERVER_CONFIRMED",
        conversationId,
        tempId,
        real: { ...real, tempId },
      });
    },
    [],
  );

  const failSend = useCallback((conversationId: string, tempId: string) => {
    dispatch({ type: "SERVER_FAILED", conversationId, tempId });
  }, []);

  const dismissFailed = useCallback(
    (conversationId: string, tempId: string) => {
      dispatch({ type: "DISMISS_FAILED", conversationId, tempId });
    },
    [],
  );

  const ctxValue = useMemo<MessagesShellContextValue>(
    () => ({
      state,
      seedActive,
      optimisticSend,
      confirmSend,
      failSend,
      dismissFailed,
    }),
    [state, seedActive, optimisticSend, confirmSend, failSend, dismissFailed],
  );

  // ---- Layout ----
  // Mobile: aside or main visible (never both). Desktop: both side-by-side.
  // `lg:flex` activates the side-by-side container at lg+; `h-[calc(100dvh-
  // 4rem)]` reserves viewport-minus-header so the layout fully fills the
  // chat-app context (Footer is rendered below in the document, hidden by
  // the page being the only element occupying the viewport here).
  const hasActive = Boolean(activeConversationId);

  return (
    <Ctx.Provider value={ctxValue}>
      <div className="fixed left-0 right-0 top-16 z-20 bg-white h-[calc(100dvh-4rem)] lg:flex">
        <aside
          className={`${hasActive ? "hidden lg:flex" : "flex"} lg:w-96 lg:flex-shrink-0 lg:border-r lg:border-neutral-200 flex-col w-full h-full overflow-y-auto`}
          aria-label="Conversation list"
        >
          <SidebarConversationList
            conversations={state.conversations}
            activeConversationId={activeConversationId}
          />
        </aside>
        <main
          className={`${hasActive ? "flex" : "hidden lg:flex"} flex-1 min-w-0 flex-col h-full`}
        >
          {children}
        </main>
      </div>
    </Ctx.Provider>
  );
}
