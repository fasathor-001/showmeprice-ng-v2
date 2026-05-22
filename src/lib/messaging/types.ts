// Stage 2.B messaging — shared types (Commit 1).
// Error codes are a string union (codebase convention; UI maps to copy).

export type MessagingError =
  | "Unauthorized" // not signed in
  | "PhoneVerificationRequired" // D-114 gate
  | "NotFound" // listing/conversation missing or unpublished
  | "Forbidden" // not a participant, or messaging own listing
  | "ContentBlocked" // D-110 filter block
  | "TooLong" // > 2000 chars
  | "Empty" // blank content
  | "FilterUnavailable" // filter infra error — fail CLOSED (don't send unfiltered)
  | "Unknown";

export type FilterAction = "allow" | "warn" | "block";

export interface FilterRule {
  id: string;
  rule_type: string;
  pattern: string;
  action: FilterAction;
  applies_to_context: string[];
  applies_to_tier: string[];
}

export interface FilterResult {
  action: FilterAction;
  rule?: FilterRule;
}

export interface CreateConversationResult {
  conversationId?: string;
  error?: MessagingError;
  reason?: string; // user-facing detail for ContentBlocked
}

export interface SendMessageResult {
  messageId?: string;
  containsWarning?: boolean;
  error?: MessagingError;
  reason?: string;
}

export interface MarkReadResult {
  ok?: boolean;
  error?: MessagingError;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  messageType: string;
  content: string | null;
  metadata: Record<string, unknown>;
  attachmentUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface GetMessagesResult {
  messages?: MessageRow[];
  hasMore?: boolean;
  error?: MessagingError;
}

export interface ConversationParty {
  id: string;
  displayName: string;
  verificationStatus: string[];
  lastSeenAt: string | null;
}

export interface ConversationSummary {
  id: string;
  role: "buyer" | "seller"; // current user's role in this conversation
  otherParty: ConversationParty;
  listing: {
    id: string;
    title: string;
    priceKobo: number | null;
    status: string;
  } | null;
  lastMessage: {
    content: string | null;
    senderId: string;
    messageType: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  lastMessageAt: string | null;
  status: string;
}

export interface ListConversationsResult {
  conversations?: ConversationSummary[];
  nextCursor?: string | null;
  error?: MessagingError;
}
