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

// Stage 2.B Commit 4 — message composer for /messages/[conversationId].
// Pure client component; the only client JS in the route besides
// ScrollToBottom. Wires `sendMessage` (Commit 1 server action) directly —
// router.refresh() handles post-send list update (Commit 5 layers
// optimistic UI + realtime reconciliation on top).
//
// Architecture decisions (per Commit 4 surface findings):
//   A. Natural end of page — composer is the last component in the page,
//      not sticky-bottom-of-viewport. Pairs with ScrollToBottom on initial
//      load so composer + latest message are visible.
//   B. Multi-line textarea, auto-grow 1-5 rows then scroll.
//   C. Enter sends + Shift+Enter newline (uniform). `enterkeyhint="send"`
//      gives mobile virtual keyboards a hint.
//   D. No template selector (D-108 templates ship in Commit 7 with
//      MessageSellerButton, where first-message context applies).
//   E. ContainsWarning → POST-send inline notice (matches D-119 "warning
//      at every send"). Auto-dismisses after 10s or user-dismissed.
//   F. Phone-unverified → REPLACE composer with verify CTA card.
//   G. Composer always enabled regardless of conversation status.
//   H. Simple `router.refresh()` after send — no optimistic UI at Commit 4.
//   I. No D-120 share button hooks (separate commit).

const MAX_LEN = 2000;
const COUNTER_THRESHOLD = 1600; // show counter at 80%+ of limit
const WARN_AUTO_DISMISS_MS = 10_000;
// Max textarea pixel height — ~5 rows at ~24px line height plus padding.
const MAX_TEXTAREA_HEIGHT = 5 * 24 + 16;

interface MessageComposerProps {
  conversationId: string;
  isPhoneVerified: boolean;
}

export function MessageComposer({
  conversationId,
  isPhoneVerified,
}: MessageComposerProps) {
  if (!isPhoneVerified) {
    return (
      <div className="px-3 sm:px-6 py-4 border-t border-neutral-200 bg-white">
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

  return <Composer conversationId={conversationId} />;
}

function Composer({ conversationId }: { conversationId: string }) {
  const router = useRouter();
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

  // Auto-dismiss warn notice.
  useEffect(() => {
    if (!warning) return;
    const t = setTimeout(() => setWarning(null), WARN_AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [warning]);

  const trimmedLen = content.trim().length;
  const isEmpty = trimmedLen === 0;
  const isOverLimit = content.length > MAX_LEN;
  const showCounter = content.length >= COUNTER_THRESHOLD;
  const sendDisabled = isEmpty || isOverLimit || isSending;

  const handleSend = async () => {
    if (sendDisabled) return;
    setIsSending(true);
    setError(null);
    setWarning(null);
    try {
      const result = await sendMessage(conversationId, content);

      // Auth / participation errors → redirect (page-level fallback).
      if (result.error === "Unauthorized") {
        router.push(`/sign-in?next=/messages/${conversationId}`);
        return;
      }
      if (result.error === "PhoneVerificationRequired") {
        router.push(`/verify-phone?next=/messages/${conversationId}`);
        return;
      }
      if (result.error === "NotFound" || result.error === "Forbidden") {
        // Conversation deleted out from under user, or permission lost.
        router.push("/messages");
        return;
      }

      // Filter / validation errors → inline banner, keep content for edit.
      if (result.error === "ContentBlocked") {
        setError(result.reason ?? "This message can't be sent.");
        return;
      }
      if (result.error === "TooLong") {
        setError(`Message is too long (${MAX_LEN} character maximum).`);
        return;
      }
      if (result.error === "Empty") {
        setError("Type a message first.");
        return;
      }
      if (result.error === "FilterUnavailable") {
        setError("Couldn't check message safety — please try again.");
        return;
      }
      if (result.error === "Unknown") {
        setError("Couldn't send. Please try again.");
        return;
      }

      // Success: clear input, surface warn notice if present, refresh thread.
      setContent("");
      if (result.containsWarning) {
        setWarning(
          "Your message contained content that may move the conversation off-platform. Keep important details on ShowMePrice for safety.",
        );
      }
      router.refresh();
      // Return focus to textarea so user can keep typing.
      textareaRef.current?.focus();
    } catch (err) {
      console.error("[MessageComposer] send failed", err);
      setError("Couldn't send. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    // Edit clears the previous error — signal that the user is addressing it.
    if (error) setError(null);
  };

  // Counter color tier: red if over limit, ink if close (>=1900), muted otherwise.
  const counterClass = isOverLimit
    ? "text-danger-text"
    : content.length >= 1900
      ? "text-ink"
      : "text-ink-400";

  // Defensive: red border on the textarea when over limit so the visual cue
  // matches the counter color.
  const textareaBorderClass = isOverLimit
    ? "border-danger-text focus:ring-danger-text focus:border-danger-text"
    : "border-neutral-200 focus:ring-teal-400 focus:border-teal-400";

  return (
    <div className="px-3 sm:px-6 py-3 border-t border-neutral-200 bg-white">
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
          size="sm"
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
