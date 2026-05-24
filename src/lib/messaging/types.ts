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

/**
 * 9-c: result of sendImageMessage. Returns the inserted message_images.id
 * values alongside the message id so the client can populate imageId in
 * its server-confirmed bubble — this lets ImageBubble's signed-URL fetch
 * effect fire on reload and on the recipient's lazy-fetch path.
 */
export interface SendImageMessageResult {
  messageId?: string;
  imageIds?: string[];
  containsWarning?: boolean;
  error?: MessagingError;
  reason?: string;
}

/** 9-c: result of reportMessage. */
export interface ReportMessageResult {
  ok?: boolean;
  error?: MessagingError;
}

export interface MarkReadResult {
  ok?: boolean;
  error?: MessagingError;
}

/**
 * Per-image state inside an image-typed message bubble. Single source of
 * truth: lives in types.ts so MessageRow (also in types.ts) can reference
 * it without circular imports. realtime.ts re-exports for the rest of the
 * codebase.
 *
 * Sender-side population (blobUrl during upload, progress) happens in 9-c;
 * recipient-side population (storagePath, imageId, dims) happens via
 * getMessageImages lazy-fetch in 9-d. In 9-b no code populates this; the
 * bubble gracefully renders a placeholder pulse when images is empty.
 */
export interface ThreadImage {
  /** Position within the message: 0, 1, or 2. */
  position: number;
  /** Final width after compression. */
  width: number;
  /** Final height after compression. */
  height: number;
  /** Client-only blob URL while bubble is uploading (9-c). */
  blobUrl?: string;
  /** Storage path once upload completes / lazy-fetch returns. */
  storagePath?: string;
  /** Resolved signed URL (5-min TTL) — populated by ImageBubble on demand. */
  signedUrl?: string;
  /** message_images.id once the row is persisted (populated by 9-d). */
  imageId?: string;
  /** 0-100 during upload (9-c). */
  progress?: number;
  /** Per-image upload failed (9-c). */
  failed?: boolean;
}

/**
 * Image-message lifecycle phases. 9-b populates only 'sent' / undefined.
 * 9-c populates the pending phases. 9-d does not introduce new phases.
 */
export type ImageMessagePhase =
  | "scheduled"
  | "uploading"
  | "confirming"
  | "sent"
  | "failed";

/**
 * Compact image-row shape returned by getMessageImages and the embedded
 * JOIN extension in getMessages. Structurally compatible with ThreadImage
 * (extra fields of ThreadImage are all optional), so server responses
 * assign cleanly into activeMessages without coercion.
 */
export interface ImageRowRef {
  imageId: string;
  position: number;
  width: number;
  height: number;
  storagePath: string;
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
  /**
   * 9-d: optional image attachments for image-type messages. Populated
   * by getMessages's JOIN extension on initial thread load OR by the
   * realtime lazy-fetch path. Absent for text messages.
   *
   * Uses the wider ThreadImage shape so ThreadMessage (extends MessageRow)
   * can carry sender-only fields like blobUrl / progress without
   * TypeScript variance errors. Server-returned rows populate only the
   * narrow ImageRowRef subset; ThreadImage's other fields stay undefined
   * on server payloads and get populated on the client by 9-c's
   * composer path.
   */
  images?: ThreadImage[];
}

export interface GetMessageImagesResult {
  images?: ImageRowRef[];
  error?: MessagingError;
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
    // Public URL for the listing's primary image (lowest `position`), or NULL
    // when the listing has no images / has been deleted (status='deleted'
    // — listing row is gone) / or no image rows exist. UI renders a generic
    // placeholder when null.
    primaryImageUrl: string | null;
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
