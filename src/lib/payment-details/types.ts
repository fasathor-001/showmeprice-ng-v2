// D-120 payment-details — shared types.
// String-union error codes (codebase convention; UI maps to copy).

export type PaymentDetailsError =
  | "Unauthorized" // not signed in
  | "PhoneVerificationRequired" // D-114 gate
  | "Forbidden" // not the right party (seller in conversation, buyer on share, etc.)
  | "NotFound" // conversation / share / payout account missing
  | "ValidationError" // bad bank_name / account_number / account_name input
  | "PaymentDetailsNotRegistered" // seller hasn't set their payout account yet
  | "ContactRevealRequired" // D-113 prerequisite: buyer must have revealed seller's contact
  | "Unknown";

/** Sanitized public shape of a seller's registered payout account. */
export interface RegisteredPaymentDetails {
  bankName: string;
  accountName: string;
  // NOTE: encrypted at rest. Server actions return the ciphertext to the
  // owning seller for display masking, never plaintext over the wire.
  accountNumberEncrypted: string;
  registeredAt: string;
  lastChangedAt: string | null;
}

/** Snapshot embedded in a payment_detail_shares row. */
export interface PaymentDetailShareSnapshot {
  bank_name: string;
  account_name: string;
  // Ciphertext copied verbatim from seller_payout_accounts at share time.
  account_number_encrypted: string;
}

/** Decrypted view returned to the buyer on getPaymentDetailsForConversation. */
export interface PaymentDetailShareView {
  shareId: string;
  conversationId: string;
  sellerId: string;
  buyerId: string;
  bankName: string;
  accountName: string;
  /** Plaintext — only ever produced inside the server action for the buyer. */
  accountNumber: string;
  sharedAt: string;
  buyerViewedAt: string | null;
  buyerWarningAcceptedAt: string | null;
  /** True if a more recent share supersedes this view (UI shows warning). */
  superseded: boolean;
}

// --- Result types ----------------------------------------------------------

export interface SetSellerPaymentDetailsResult {
  ok?: true;
  /** Was this an initial registration vs. an update of an existing row. */
  created?: boolean;
  error?: PaymentDetailsError;
}

export interface SharePaymentDetailsResult {
  shareId?: string;
  error?: PaymentDetailsError;
}

export interface GetPaymentDetailsForConversationResult {
  hasShare?: boolean;
  share?: PaymentDetailShareView;
  error?: PaymentDetailsError;
}

export interface MarkPaymentDetailsViewedResult {
  ok?: true;
  error?: PaymentDetailsError;
}

export interface AcceptPaymentDetailsWarningResult {
  ok?: true;
  error?: PaymentDetailsError;
}
