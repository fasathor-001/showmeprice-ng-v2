"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getMessages,
  listConversations,
  sendMessage,
} from "@/lib/messaging/actions";
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
import { ConnectionStrip } from "./ConnectionStrip";

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
  seedActive: (
    conversationId: string,
    messages: ThreadMessage[],
    hasMore: boolean,
  ) => void;
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
  /**
   * TC-002: re-attempt sending a failed bubble. Re-uses the same tempId so
   * the bubble stays in place. The MessageThread looks up the bubble's
   * cached content and dispatches RETRY_FAILED + a fresh sendMessage call.
   * Returns the tempId so the caller can wire confirmSend / failSend.
   */
  retryFailed: (conversationId: string, tempId: string) => void;
  /** "Load more" on the sidebar — fetches and appends the next page of conversations. */
  loadMoreConversations: (cursor: string) => Promise<void>;
  /**
   * "Load earlier messages" on the thread — fetches an older page using the
   * oldest currently-loaded message as the cursor. Returns the number of
   * messages prepended so callers can adjust scroll position.
   */
  loadEarlierMessages: (
    conversationId: string,
    oldestMessageId: string,
  ) => Promise<number>;
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
  initialNextCursor: string | null;
  children: ReactNode;
}

export function MessagesShell({
  userId,
  initialConversations,
  initialNextCursor,
  children,
}: MessagesShellProps) {
  // Active conversation id from URL: at /messages/[id], segment === [id];
  // at /messages, segment === null.
  const segment = useSelectedLayoutSegment();
  const activeConversationId = segment ?? null;

  const [state, dispatch] = useReducer(realtimeReducer, {
    conversations: initialConversations,
    conversationsNextCursor: initialNextCursor,
    activeConversationId,
    activeMessages: [],
    activeMessagesHasMore: false,
    activeSeeded: false,
  } satisfies RealtimeState);

  // TC-011: track whether the realtime channel is currently connected. Driven
  // by the .subscribe(status) handler below; ConnectionStrip applies its own
  // 2s threshold so micro-flaps don't render. Initial value is true (we
  // optimistically assume connected until the subscribe handler tells us
  // otherwise; ConnectionStrip is hidden until isReconnecting flips true and
  // stays true past the threshold).
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Ref to the latest activeMessages so retryFailed can read the cached
  // content without recreating the callback on every state change.
  const messagesRef = useRef(state.activeMessages);
  useEffect(() => {
    messagesRef.current = state.activeMessages;
  }, [state.activeMessages]);

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
            if (process.env.NODE_ENV !== "production") {
              console.log("[MessagesShell] INSERT received:", row);
            }
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
            if (process.env.NODE_ENV !== "production") {
              console.log("[MessagesShell] UPDATE received:", {
                old: payload.old,
                new: row,
              });
            }
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
          // TC-011: reflect connection state for the ConnectionStrip. SUBSCRIBED
          // is the healthy state; anything else (CHANNEL_ERROR, TIMED_OUT, CLOSED)
          // counts as reconnecting. The strip applies its own 2s threshold so
          // micro-flaps don't render.
          setIsReconnecting(status !== "SUBSCRIBED");
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
    (conversationId: string, messages: ThreadMessage[], hasMore: boolean) => {
      dispatch({ type: "SEED_ACTIVE", conversationId, messages, hasMore });
    },
    [],
  );

  // Sidebar "Load more conversations" handler.
  const loadMoreConversations = useCallback(async (cursor: string) => {
    const result = await listConversations("all", 20, cursor);
    if (result.error) {
      if (process.env.NODE_ENV !== "production") {
        console.error(
          "[MessagesShell] loadMoreConversations error:",
          result.error,
        );
      }
      return;
    }
    dispatch({
      type: "PAGINATED_APPEND_CONVERSATIONS",
      conversations: result.conversations ?? [],
      nextCursor: result.nextCursor ?? null,
    });
  }, []);

  // Thread "Load earlier messages" handler. Returns the number of messages
  // prepended so the caller can adjust scroll position.
  const loadEarlierMessages = useCallback(
    async (conversationId: string, oldestMessageId: string): Promise<number> => {
      const result = await getMessages(conversationId, 50, oldestMessageId);
      if (result.error || !result.messages) {
        if (process.env.NODE_ENV !== "production") {
          console.error(
            "[MessagesShell] loadEarlierMessages error:",
            result.error,
          );
        }
        return 0;
      }
      dispatch({
        type: "PAGINATED_PREPEND_MESSAGES",
        conversationId,
        messages: result.messages as ThreadMessage[],
        hasMore: result.hasMore ?? false,
      });
      return result.messages.length;
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
      if (process.env.NODE_ENV !== "production") {
        console.log("[MessagesShell] OPTIMISTIC_ADD dispatched", {
          conversationId,
          tempId,
          contentPreview: (partial.content ?? "").slice(0, 40),
        });
      }
      dispatch({ type: "OPTIMISTIC_ADD", conversationId, message });
      return tempId;
    },
    [],
  );

  const confirmSend = useCallback(
    (conversationId: string, tempId: string, real: MessageRow) => {
      if (process.env.NODE_ENV !== "production") {
        console.log("[MessagesShell] SERVER_CONFIRMED dispatched", {
          conversationId,
          tempId,
          realId: real.id,
        });
      }
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
    if (process.env.NODE_ENV !== "production") {
      console.log("[MessagesShell] SERVER_FAILED dispatched", {
        conversationId,
        tempId,
      });
    }
    dispatch({ type: "SERVER_FAILED", conversationId, tempId });
  }, []);

  const dismissFailed = useCallback(
    (conversationId: string, tempId: string) => {
      dispatch({ type: "DISMISS_FAILED", conversationId, tempId });
    },
    [],
  );

  // TC-002: retry a failed bubble. Look up the cached content from the
  // current messages state, dispatch RETRY_FAILED (resets pending+failed,
  // increments retryCount), then re-call sendMessage. On success/failure,
  // dispatches SERVER_CONFIRMED or SERVER_FAILED using the SAME tempId so
  // the bubble keeps its in-thread position (per §1.G surface findings).
  //
  // Offline guard: navigator.onLine check before dispatching. If offline,
  // no-op silently — no budget consumed (§1.E). User feedback for offline
  // retry is surfaced by the composer banner separately.
  const retryFailed = useCallback(
    (conversationId: string, tempId: string) => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        // Offline guard — no dispatch, no budget consumed.
        return;
      }
      const target = messagesRef.current.find((m) => m.id === tempId);
      if (!target) return;
      const content = target.content ?? "";
      if (!content.trim()) return;

      dispatch({ type: "RETRY_FAILED", conversationId, tempId });

      void (async () => {
        try {
          const result = await sendMessage(conversationId, content);
          if (result.error) {
            dispatch({ type: "SERVER_FAILED", conversationId, tempId });
            return;
          }
          if (result.messageId) {
            dispatch({
              type: "SERVER_CONFIRMED",
              conversationId,
              tempId,
              real: {
                id: result.messageId,
                conversationId,
                senderId: target.senderId,
                messageType: target.messageType,
                content,
                metadata: target.metadata,
                attachmentUrl: target.attachmentUrl,
                readAt: null,
                createdAt: new Date().toISOString(),
                tempId,
              },
            });
          }
        } catch (err) {
          console.error("[MessagesShell] retryFailed sendMessage threw", err);
          dispatch({ type: "SERVER_FAILED", conversationId, tempId });
        }
      })();
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
      retryFailed,
      loadMoreConversations,
      loadEarlierMessages,
    }),
    [
      state,
      seedActive,
      optimisticSend,
      confirmSend,
      failSend,
      dismissFailed,
      retryFailed,
      loadMoreConversations,
      loadEarlierMessages,
    ],
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
      <div className="fixed left-0 right-0 top-16 z-20 bg-white h-[calc(100dvh-4rem)] flex flex-col">
        {/* TC-011: thin strip at the top of the messaging surface when the
            realtime channel is disconnected past the 2s threshold. Spans
            full width across sidebar + main pane. */}
        <ConnectionStrip isReconnecting={isReconnecting} />
        <div className="flex-1 min-h-0 lg:flex">
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
      </div>
    </Ctx.Provider>
  );
}
