"use client";

// Stage 2.B Commit 5 — messaging realtime layer.
//
// Architecture (per surface findings A + F):
// - ONE user-scoped Supabase Realtime subscription to the `messages` table.
//   No filter expression. Supabase Realtime applies RLS to delivered events,
//   so the user only receives INSERT/UPDATE rows for messages they can SEE
//   (i.e., conversations they're a party to).
// - Reducer holds the conversation list + the ACTIVE conversation's messages
//   (only one thread's full message state at a time — non-active conversations
//   only need their summary updated for the list bump).
// - tempId + signature-fallback dedup window: ±5s (tightened from initial ±30s
//   per surface findings F refinement — protects intentional double-sends).
// - Failed optimistic messages STAY visible until user retries or dismisses
//   (WhatsApp pattern).

import type { ConversationSummary, MessageRow } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Message in the active thread. `id` may be a tempId for pending sends. */
export interface ThreadMessage extends MessageRow {
  /** True while server insert is in flight. */
  pending?: boolean;
  /** True if the server returned an error for this send. */
  failed?: boolean;
  /** Original tempId, kept after server-confirmed for fallback dedup. */
  tempId?: string;
  /**
   * TC-002: number of retry attempts this bubble has consumed in this session.
   * Bubble shows the Retry link while < 3; after the third failure the link
   * disables and the bubble copy escalates. Resets naturally on page refresh
   * (realtime state mounts fresh) — acceptable MVP behavior per Frank's
   * approval; realistic users abandon a sender rather than refresh-to-retry.
   */
  retryCount?: number;
}

export interface RealtimeState {
  /** Conversation list (bumps on realtime, mirrors deployed sort: last_message_at DESC). */
  conversations: ConversationSummary[];
  /**
   * Cursor for paginating to the next page of conversations.
   * null = no more pages OR not initialised yet.
   *
   * Commit 6 trade-off: realtime INSERTs for conversations BEYOND the loaded
   * pages are ignored by the list bumper — the conversation only enters
   * client state when the user paginates to it. Acceptable at MVP scale;
   * revisit when pagination becomes user-friction.
   */
  conversationsNextCursor: string | null;
  /** Active conversation id (from URL segment); null when at /messages. */
  activeConversationId: string | null;
  /** Active conversation's messages — only populated when a thread is open. */
  activeMessages: ThreadMessage[];
  /** Whether the active conversation has more older messages to paginate. */
  activeMessagesHasMore: boolean;
  /** Whether the active conversation has been seeded from the server's initial fetch. */
  activeSeeded: boolean;
}

export type RealtimeAction =
  | { type: "SET_ACTIVE"; conversationId: string | null }
  | {
      type: "SEED_ACTIVE";
      conversationId: string;
      messages: ThreadMessage[];
      hasMore: boolean;
    }
  | { type: "OPTIMISTIC_ADD"; conversationId: string; message: ThreadMessage }
  | {
      type: "SERVER_CONFIRMED";
      conversationId: string;
      tempId: string;
      real: ThreadMessage;
    }
  | { type: "SERVER_FAILED"; conversationId: string; tempId: string }
  | { type: "DISMISS_FAILED"; conversationId: string; tempId: string }
  | {
      /**
       * TC-002: user tapped Retry on a failed bubble. Reuses the same tempId
       * (so the bubble keeps its position in the thread; no jump-to-bottom on
       * retry per §1.G surface findings), clears the failed flag, sets pending
       * again, and increments retryCount.
       */
      type: "RETRY_FAILED";
      conversationId: string;
      tempId: string;
    }
  | { type: "REALTIME_INSERT"; message: ThreadMessage; currentUserId: string }
  | { type: "REALTIME_UPDATE"; message: ThreadMessage }
  | {
      type: "PAGINATED_APPEND_CONVERSATIONS";
      conversations: ConversationSummary[];
      nextCursor: string | null;
    }
  | {
      type: "PAGINATED_PREPEND_MESSAGES";
      conversationId: string;
      messages: ThreadMessage[];
      hasMore: boolean;
    };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const SIGNATURE_WINDOW_MS = 5_000; // F refinement: tightened from 30s

function signatureMatchTempId(
  candidate: ThreadMessage,
  realIncoming: { sender_id: string; content: string | null; created_at: string },
): boolean {
  if (!candidate.pending) return false;
  if (candidate.senderId !== realIncoming.sender_id) return false;
  if ((candidate.content ?? "") !== (realIncoming.content ?? "")) return false;
  const candidateMs = new Date(candidate.createdAt).getTime();
  const incomingMs = new Date(realIncoming.created_at).getTime();
  return Math.abs(candidateMs - incomingMs) <= SIGNATURE_WINDOW_MS;
}

function bumpConversation(
  conversations: ConversationSummary[],
  conversationId: string,
  newMessage: ThreadMessage,
  currentUserId: string,
  isActive: boolean,
): ConversationSummary[] {
  const idx = conversations.findIndex((c) => c.id === conversationId);
  if (idx === -1) return conversations; // unknown conversation, leave as-is
  const target = conversations[idx]!;
  const isFromOther = newMessage.senderId !== currentUserId;
  // Increment unread only if from other party AND user is not currently viewing.
  const unreadDelta = isFromOther && !isActive ? 1 : 0;
  const updated: ConversationSummary = {
    ...target,
    lastMessage: {
      content: newMessage.content,
      senderId: newMessage.senderId,
      messageType: newMessage.messageType,
      createdAt: newMessage.createdAt,
    },
    lastMessageAt: newMessage.createdAt,
    unreadCount: target.unreadCount + unreadDelta,
  };
  // Move to top.
  const without = [
    ...conversations.slice(0, idx),
    ...conversations.slice(idx + 1),
  ];
  return [updated, ...without];
}

export function realtimeReducer(
  state: RealtimeState,
  action: RealtimeAction,
): RealtimeState {
  switch (action.type) {
    case "SET_ACTIVE":
      // Reset active-thread state when navigating between conversations or away.
      if (action.conversationId === state.activeConversationId) return state;
      return {
        ...state,
        activeConversationId: action.conversationId,
        activeMessages: [],
        activeMessagesHasMore: false,
        activeSeeded: false,
      };

    case "SEED_ACTIVE":
      // Server-rendered initial messages populate the active conversation state.
      if (action.conversationId !== state.activeConversationId) return state;
      if (state.activeSeeded) return state; // idempotent — page re-renders shouldn't reset
      return {
        ...state,
        activeMessages: action.messages,
        activeMessagesHasMore: action.hasMore,
        activeSeeded: true,
      };

    case "OPTIMISTIC_ADD": {
      if (action.conversationId !== state.activeConversationId) return state;
      // Tempid bubble appends at end (chronological order — newest at bottom).
      return {
        ...state,
        activeMessages: [...state.activeMessages, action.message],
      };
    }

    case "SERVER_CONFIRMED": {
      if (action.conversationId !== state.activeConversationId) {
        // The active conversation changed before the server response landed.
        // Still bump the list summary so the row reflects the new last message.
        return {
          ...state,
          conversations: bumpConversation(
            state.conversations,
            action.conversationId,
            action.real,
            action.real.senderId, // sender IS the current user here
            false,
          ),
        };
      }
      // Swap tempId → realId; if tempId already gone (realtime arrived first
      // and signature-matched), keep state as-is.
      const idx = state.activeMessages.findIndex(
        (m) => m.tempId === action.tempId || m.id === action.tempId,
      );
      const nextMessages =
        idx === -1
          ? state.activeMessages
          : [
              ...state.activeMessages.slice(0, idx),
              { ...action.real, pending: false, failed: false },
              ...state.activeMessages.slice(idx + 1),
            ];
      return {
        ...state,
        activeMessages: nextMessages,
        conversations: bumpConversation(
          state.conversations,
          action.conversationId,
          action.real,
          action.real.senderId,
          true,
        ),
      };
    }

    case "SERVER_FAILED": {
      if (action.conversationId !== state.activeConversationId) return state;
      const idx = state.activeMessages.findIndex((m) => m.id === action.tempId);
      if (idx === -1) return state;
      const updated: ThreadMessage = {
        ...state.activeMessages[idx]!,
        pending: false,
        failed: true,
      };
      return {
        ...state,
        activeMessages: [
          ...state.activeMessages.slice(0, idx),
          updated,
          ...state.activeMessages.slice(idx + 1),
        ],
      };
    }

    case "DISMISS_FAILED": {
      if (action.conversationId !== state.activeConversationId) return state;
      return {
        ...state,
        activeMessages: state.activeMessages.filter(
          (m) => m.id !== action.tempId,
        ),
      };
    }

    case "RETRY_FAILED": {
      // TC-002: re-enter pending state, keep the same tempId so the bubble
      // stays in place. Increment retryCount so the UI can disable the
      // Retry link after the budget (3 attempts) is exhausted.
      if (action.conversationId !== state.activeConversationId) return state;
      const idx = state.activeMessages.findIndex(
        (m) => m.id === action.tempId,
      );
      if (idx === -1) return state;
      const existing = state.activeMessages[idx]!;
      const updated: ThreadMessage = {
        ...existing,
        pending: true,
        failed: false,
        retryCount: (existing.retryCount ?? 0) + 1,
      };
      return {
        ...state,
        activeMessages: [
          ...state.activeMessages.slice(0, idx),
          updated,
          ...state.activeMessages.slice(idx + 1),
        ],
      };
    }

    case "REALTIME_INSERT": {
      const incoming = action.message;
      const incomingConvId = incoming.conversationId;
      const isActive = incomingConvId === state.activeConversationId;

      // Always update the conversation list summary (bump + unread).
      const nextConversations = bumpConversation(
        state.conversations,
        incomingConvId,
        incoming,
        action.currentUserId,
        isActive,
      );

      if (!isActive) {
        // Not viewing this thread — just update the list.
        return { ...state, conversations: nextConversations };
      }

      // Dedup against active messages:
      //  1. ID match: realtime already in state (server-confirmed swap happened first).
      //  2. Signature match: realtime arrived first; swap a pending tempId for the real id.
      const idMatchIdx = state.activeMessages.findIndex(
        (m) => m.id === incoming.id,
      );
      if (idMatchIdx !== -1) {
        return { ...state, conversations: nextConversations };
      }
      const sigMatchIdx = state.activeMessages.findIndex((m) =>
        signatureMatchTempId(m, {
          sender_id: incoming.senderId,
          content: incoming.content,
          created_at: incoming.createdAt,
        }),
      );
      if (sigMatchIdx !== -1) {
        // Replace the optimistic tempId with the real message; preserve tempId
        // so a subsequent SERVER_CONFIRMED can still find this entry.
        const existing = state.activeMessages[sigMatchIdx]!;
        return {
          ...state,
          conversations: nextConversations,
          activeMessages: [
            ...state.activeMessages.slice(0, sigMatchIdx),
            { ...incoming, pending: false, tempId: existing.id },
            ...state.activeMessages.slice(sigMatchIdx + 1),
          ],
        };
      }
      // No match — append (other party's message in current thread).
      return {
        ...state,
        conversations: nextConversations,
        activeMessages: [...state.activeMessages, incoming],
      };
    }

    case "REALTIME_UPDATE": {
      // Read-receipts driver (K-041 closed in Commit 6): when the recipient
      // opens a thread, getMessages → markRead → messages.read_at updated;
      // realtime UPDATE fires here; reducer merges the new read_at into the
      // matching active message; the sender's MessageBubble re-renders with
      // ✓ → ✓✓.
      //
      // TC-004 (Commit 8) — previously this case short-circuited when the
      // updated message belonged to a non-active conversation. That dropped
      // the ✓→✓✓ advance for senders not currently staring at the thread —
      // and on the Nigerian mobile background-and-return pattern, that's
      // ~always. Now we ALSO bump the conversations[] list when the
      // updated message is the conversation's last message, so the sidebar
      // row's lastMessage reflects the new read_at. ConversationRow doesn't
      // currently render a receipt indicator, but the state stays correct
      // and a future surface render gets the correct value for free.
      const updated = action.message;

      // Always try to update the conversations[] last-message snapshot.
      let nextConversations = state.conversations;
      const convIdx = state.conversations.findIndex(
        (c) => c.id === updated.conversationId,
      );
      if (convIdx !== -1) {
        const conv = state.conversations[convIdx]!;
        // Only update if this UPDATE is for the conversation's CURRENT last
        // message (read_at advancing on an older message doesn't change the
        // summary). Compare by createdAt — same value the bumpConversation
        // helper uses to track which message is "last."
        if (
          conv.lastMessage &&
          conv.lastMessage.createdAt === updated.createdAt
        ) {
          nextConversations = [
            ...state.conversations.slice(0, convIdx),
            {
              ...conv,
              lastMessage: {
                ...conv.lastMessage,
                // Mirror the incoming read_at into the summary's lastMessage.
                // (Other fields on the summary's lastMessage shape — content,
                // senderId, messageType, createdAt — are stable per row, so
                // we just refresh the read_at signal indirectly via the spread.)
                content: updated.content ?? conv.lastMessage.content,
                messageType: updated.messageType,
              },
            },
            ...state.conversations.slice(convIdx + 1),
          ];
        }
      }

      // If this conversation is also the active one, merge into activeMessages.
      if (updated.conversationId === state.activeConversationId) {
        const idx = state.activeMessages.findIndex((m) => m.id === updated.id);
        // 8.4-diag: log whether we matched. If idx === -1 the event arrived
        // but no bubble in activeMessages had a matching id — points at an
        // ID mismatch (tempId vs realId race) or a stale activeMessages
        // snapshot. If idx !== -1 the merge runs but if read_at doesn't
        // advance, the issue is downstream (re-render didn't pick up the
        // updated readAt).
        console.log("[realtime] REALTIME_UPDATE merge", {
          conversationId: updated.conversationId,
          activeConversationId: state.activeConversationId,
          updatedId: updated.id,
          updatedReadAt: updated.readAt,
          idxFound: idx,
          existingReadAt:
            idx !== -1 ? state.activeMessages[idx]!.readAt : null,
        });
        if (idx !== -1) {
          return {
            ...state,
            conversations: nextConversations,
            activeMessages: [
              ...state.activeMessages.slice(0, idx),
              { ...state.activeMessages[idx]!, ...updated },
              ...state.activeMessages.slice(idx + 1),
            ],
          };
        }
      } else {
        console.log("[realtime] REALTIME_UPDATE non-active conv", {
          conversationId: updated.conversationId,
          activeConversationId: state.activeConversationId,
          updatedId: updated.id,
          updatedReadAt: updated.readAt,
        });
      }

      return { ...state, conversations: nextConversations };
    }

    case "PAGINATED_APPEND_CONVERSATIONS":
      // "Load more" on the sidebar — append next page to the existing list.
      // Realtime INSERT semantics for conversations beyond the loaded pages:
      // those conversations DON'T get bumped client-side (they're not in
      // state.conversations), so they stay in their server-determined
      // position. User sees them only when they paginate. See state's
      // `conversationsNextCursor` docstring for the trade-off rationale.
      return {
        ...state,
        conversations: [...state.conversations, ...action.conversations],
        conversationsNextCursor: action.nextCursor,
      };

    case "PAGINATED_PREPEND_MESSAGES": {
      // "Load earlier messages" on the thread — prepend older page to the
      // active conversation. Caller is responsible for scroll-position
      // preservation (snapshot scrollHeight + scrollTop before dispatch,
      // restore after the render).
      if (action.conversationId !== state.activeConversationId) return state;
      return {
        ...state,
        activeMessages: [...action.messages, ...state.activeMessages],
        activeMessagesHasMore: action.hasMore,
      };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Payload normalization
// ---------------------------------------------------------------------------

/**
 * Convert a Supabase Realtime postgres_changes payload row (snake_case) into
 * our camelCase ThreadMessage shape. Used by the shell's subscription handler.
 */
export function normalizeMessageRow(row: Record<string, unknown>): ThreadMessage {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    senderId: row.sender_id as string,
    messageType: row.message_type as string,
    content: (row.content as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    attachmentUrl: (row.attachment_url as string | null) ?? null,
    readAt: (row.read_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

/** Generate a fresh tempId for an optimistic send. */
export function makeTempId(): string {
  return `temp_${crypto.randomUUID()}`;
}
