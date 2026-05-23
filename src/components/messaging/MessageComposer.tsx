"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { Button } from "@/components/ui";
import { sendMessage } from "@/lib/messaging/actions";
import { useMessagesShell } from "./MessagesShell";

// Stage 2.B Commit 4 — message composer (refactored for optimistic UI in
// Commit 5 per surface findings E + F).
//
// Architecture decisions (current, includes Commit 5 changes marked ←):
//   A. Natural end of page → Commit 4.1 lifted layout to fixed-fullheight at
//      route-segment level; this composer is the last child of that column.
//   B. Multi-line textarea, auto-grow 1-5 rows then scroll.
//   C. Enter sends + Shift+Enter newline (uniform). `enterkeyhint="send"`
//      gives mobile virtual keyboards a hint.
//   D. No template selector (D-108 templates ship in Commit 7).
//   E. ContainsWarning → persistent inline notice; replace, not stack.
//   F. Phone-unverified → REPLACE composer with verify CTA card.
//   G. Composer always enabled regardless of conversation status.
//   ← H. Commit 5: OPTIMISTIC SEND. Append a temp bubble immediately via the
//        shell context, clear the textarea, then call sendMessage. On server
//        confirmation: shell swaps tempId → realId. On error: shell marks
//        the bubble as failed; user can dismiss via the bubble itself.
//        Auth / participation / filter errors still surface inline; the
//        optimistic bubble is rolled back via dismiss-on-fail semantics.
//   I. No D-120 share button hooks (separate commit).

const MAX_LEN = 2000;
const COUNTER_THRESHOLD = 1600;
const MAX_TEXTAREA_HEIGHT = 5 * 24 + 16;

interface MessageComposerProps {
  conversationId: string;
  isPhoneVerified: boolean;
  currentUserId: string;
}

export function MessageComposer({
  conversationId,
  isPhoneVerified,
  currentUserId,
}: MessageComposerProps) {
  if (!isPhoneVerified) {
    return (
      <div className="px-3 sm:px-6 py-4 border-t border-neutral-200 bg-white shrink-0">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-center max-w-md mx-auto">
          <h2 className="text-sm font-medium text-ink mb-2">
            Verify your phone to send messages
          </h2>
          <p className="text-xs text-ink-600 mb-4">
            For everyone&apos;s safety, only phone-verified users can send
            messages on ShowMePrice.
          </p>
          <Link
            href={`/verify-phone?next=/messages/${conversationId}`}
            className="inline-flex items-center justify-center bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700"
          >
            Verify phone →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Composer
      conversationId={conversationId}
      currentUserId={currentUserId}
    />
  );
}

function Composer({
  conversationId,
  currentUserId,
}: {
  conversationId: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const { optimisticSend, confirmSend, failSend } = useMessagesShell();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Auto-grow textarea on content change.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT) + "px";
  }, [content]);

  const trimmedLen = content.trim().length;
  const isEmpty = trimmedLen === 0;
  const isOverLimit = content.length > MAX_LEN;
  const showCounter = content.length >= COUNTER_THRESHOLD;
  const sendDisabled = isEmpty || isOverLimit || isSending;

  const handleSend = async () => {
    if (sendDisabled) return;
    setIsSending(true);
    setError(null);

    // Capture text + clear textarea immediately for snappy UX.
    const text = content;
    setContent("");

    if (process.env.NODE_ENV !== "production") {
      console.log("[MessageComposer] handleSend start", {
        conversationId,
        currentUserId,
        textPreview: text.slice(0, 40),
      });
    }

    // Optimistic: dispatch to shell, get tempId for later reconciliation.
    const tempId = optimisticSend(conversationId, {
      conversationId,
      senderId: currentUserId,
      messageType: "text",
      content: text,
      metadata: {},
      attachmentUrl: null,
      readAt: null,
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("[MessageComposer] optimisticSend returned tempId:", tempId);
    }

    try {
      const result = await sendMessage(conversationId, text);
      if (process.env.NODE_ENV !== "production") {
        console.log("[MessageComposer] sendMessage result:", result);
      }

      // Auth / participation errors → redirect (rare; backstop).
      if (result.error === "Unauthorized") {
        failSend(conversationId, tempId);
        router.push(`/sign-in?next=/messages/${conversationId}`);
        return;
      }
      if (result.error === "PhoneVerificationRequired") {
        failSend(conversationId, tempId);
        router.push(`/verify-phone?next=/messages/${conversationId}`);
        return;
      }
      if (result.error === "NotFound" || result.error === "Forbidden") {
        failSend(conversationId, tempId);
        router.push("/messages");
        return;
      }

      // Filter / validation errors → mark bubble failed + inline banner.
      if (result.error === "ContentBlocked") {
        failSend(conversationId, tempId);
        setError(result.reason ?? "This message can't be sent.");
        // Restore content so the user can edit + retry.
        setContent(text);
        return;
      }
      if (result.error === "TooLong") {
        failSend(conversationId, tempId);
        setError(`Message is too long (${MAX_LEN} character maximum).`);
        setContent(text);
        return;
      }
      if (result.error === "Empty") {
        failSend(conversationId, tempId);
        setError("Type a message first.");
        setContent(text);
        return;
      }
      if (result.error === "FilterUnavailable") {
        failSend(conversationId, tempId);
        setError("Couldn't check message safety — please try again.");
        setContent(text);
        return;
      }
      if (result.error === "Unknown") {
        failSend(conversationId, tempId);
        setError("Couldn't send. Please try again.");
        setContent(text);
        return;
      }

      // Success — swap tempId for real message via the shell.
      if (result.messageId) {
        confirmSend(conversationId, tempId, {
          id: result.messageId,
          conversationId,
          senderId: currentUserId,
          messageType: "text",
          content: text,
          metadata: {},
          attachmentUrl: null,
          readAt: null,
          createdAt: new Date().toISOString(),
        });
      }

      if (result.containsWarning) {
        setWarning(
          "Your message contained content that may move the conversation off-platform. Keep important details on ShowMePrice for safety.",
        );
      }

      textareaRef.current?.focus();
    } catch (err) {
      console.error("[MessageComposer] send failed", err);
      failSend(conversationId, tempId);
      setError("Couldn't send. Please try again.");
      setContent(text);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    if (error) setError(null);
  };

  const counterClass = isOverLimit
    ? "text-danger-text"
    : content.length >= 1900
      ? "text-ink"
      : "text-ink-400";

  const textareaBorderClass = isOverLimit
    ? "border-danger-text focus:ring-danger-text focus:border-danger-text"
    : "border-neutral-200 focus:ring-teal-400 focus:border-teal-400";

  return (
    <div className="px-3 sm:px-6 py-3 border-t border-neutral-200 bg-white shrink-0">
      {warning && (
        <div className="mb-2 px-3 py-2 rounded-lg bg-warning-bg text-warning-text text-xs flex items-start gap-2">
          <span className="flex-1">{warning}</span>
          <button
            type="button"
            onClick={() => setWarning(null)}
            className="shrink-0 underline hover:no-underline text-warning-text"
            aria-label="Dismiss warning"
          >
            Dismiss
          </button>
        </div>
      )}
      {error && (
        <div
          className="mb-2 px-3 py-2 rounded-lg bg-danger-bg text-danger-text text-xs"
          role="alert"
        >
          {error}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message"
          rows={1}
          enterKeyHint="send"
          disabled={isSending}
          className={`flex-1 min-h-[40px] resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:bg-neutral-50 disabled:cursor-not-allowed ${textareaBorderClass}`}
          aria-label="Message"
          aria-invalid={isOverLimit || Boolean(error)}
          style={{ maxHeight: `${MAX_TEXTAREA_HEIGHT}px` }}
        />
        <Button
          variant="primary"
          size="md"
          onClick={handleSend}
          disabled={sendDisabled}
          aria-label="Send message"
        >
          {isSending ? "Sending…" : "Send"}
        </Button>
      </div>
      {showCounter && (
        <div className={`mt-1 text-xs text-right ${counterClass}`}>
          {content.length} / {MAX_LEN}
        </div>
      )}
    </div>
  );
}
