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
import { useNavigatorOnline } from "@/lib/use-navigator-online";
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

// TC-010: sessionStorage key prefix for draft preservation across auth-
// expiry redirects. Namespaced `sp:msg-draft:` (per §4.A surface findings)
// so future draft types (listing drafts, etc.) can coexist without
// collisions. sessionStorage is tab-scoped; drafts naturally clear on tab
// close so transient negotiation content doesn't persist to disk.
const DRAFT_KEY_PREFIX = "sp:msg-draft:";

// TC-002: banner-level retry budget (mirrors the bubble-level RETRY_BUDGET
// in MessageBubble). After the 3rd failure, the banner Retry link disappears
// and the copy escalates.
const BANNER_RETRY_BUDGET = 3;

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
  const isOnline = useNavigatorOnline();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  // TC-002: cache the last failed-send content for the banner Retry link.
  // null when no recent failure (banner Retry hidden). Reset on successful
  // send. Budget tracked alongside via lastFailureRetries.
  const [lastFailedContent, setLastFailedContent] = useState<string | null>(
    null,
  );
  const [lastFailureRetries, setLastFailureRetries] = useState(0);
  // TC-002 §1.E: show "You're offline..." inline below the banner when the
  // user attempted to send/retry while offline. Cleared when isOnline returns
  // to true OR when content is cleared via successful send.
  const [showOfflineHint, setShowOfflineHint] = useState(false);

  // TC-010: hydrate textarea from any stashed draft on mount. Silent restore
  // per §4.B surface findings — no toast, no visual indicator. Drafts come
  // from a pre-send action that hit auth-expiry and redirected the user;
  // after re-login they land back here with their content waiting.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stashed = sessionStorage.getItem(
        `${DRAFT_KEY_PREFIX}${conversationId}`,
      );
      if (stashed && stashed.trim().length > 0) {
        setContent(stashed);
      }
    } catch {
      // sessionStorage may throw in private-mode Safari; non-fatal.
    }
  }, [conversationId]);

  // Auto-grow textarea on content change.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT) + "px";
  }, [content]);

  // Clear the offline hint when the user reconnects.
  useEffect(() => {
    if (isOnline && showOfflineHint) setShowOfflineHint(false);
  }, [isOnline, showOfflineHint]);

  // TC-010 (Commit 8.3 — single-responsibility refactor): each helper does
  // exactly one thing.
  //   - writeDraft PERSISTS a non-empty draft. Never removes — calling it
  //     with an empty string is a no-op, NOT a stealth delete. This is the
  //     key bug from the original 8.0 implementation: writeDraft("") removing
  //     the key created a hidden invariant where ANY browser quirk that
  //     synthesised an onChange with empty value (extensions, autofill,
  //     accessibility tools after setContent("")) would silently wipe the
  //     draft, defeating the auth-expiry restore path.
  //   - dropDraft REMOVES. Only called from explicit cleanup paths.
  // Callsite contract:
  //   - handleChange writes on every non-empty keystroke; calls dropDraft
  //     when the textarea transitions to empty by USER ACTION (Backspace
  //     to empty). The empty-by-user path is the only legitimate clear
  //     during typing.
  //   - handleSend writes BEFORE setContent("") so the draft is in storage
  //     before any re-render can fire stray onChange events.
  //   - performSend's auth-expiry / phone-verify / not-found paths
  //     DEFENSIVELY re-write the draft immediately before router.push as
  //     belt-and-suspenders. The cost is one extra ~1ms sync setItem; the
  //     benefit is the draft survives regardless of any quirk in between.
  //   - performSend on confirmed success calls dropDraft.
  //   - performSend on filter/other inline error does nothing — content is
  //     restored to the textarea via setContent(text); stash still matches.
  const writeDraft = (value: string) => {
    if (typeof window === "undefined") return;
    if (value.length === 0) return; // no-op; explicit removal goes through dropDraft
    try {
      sessionStorage.setItem(`${DRAFT_KEY_PREFIX}${conversationId}`, value);
    } catch {
      // sessionStorage may throw in private-mode Safari; non-fatal.
    }
  };
  const dropDraft = () => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.removeItem(`${DRAFT_KEY_PREFIX}${conversationId}`);
    } catch {
      // non-fatal
    }
  };

  const trimmedLen = content.trim().length;
  const isEmpty = trimmedLen === 0;
  const isOverLimit = content.length > MAX_LEN;
  const showCounter = content.length >= COUNTER_THRESHOLD;
  const sendDisabled = isEmpty || isOverLimit || isSending;

  // Core send routine, parameterised so the same path serves both the
  // primary Send button and the TC-002 banner Retry link.
  const performSend = async (text: string) => {
    setIsSending(true);
    setError(null);

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

    try {
      const result = await sendMessage(conversationId, text);

      // Auth / participation errors → redirect (rare; backstop).
      // 8.3 fix: defensively re-write the draft to sessionStorage IMMEDIATELY
      // before router.push. handleSend already wrote it once, but anything
      // between then and now could theoretically have cleared it (browser
      // extensions, autofill, etc.). One extra sync setItem is cheap; missing
      // the draft after auth-expiry is the entire point of TC-010 — the
      // worst possible UX regression.
      if (result.error === "Unauthorized") {
        failSend(conversationId, tempId);
        writeDraft(text);
        router.push(`/sign-in?next=/messages/${conversationId}`);
        return;
      }
      if (result.error === "PhoneVerificationRequired") {
        failSend(conversationId, tempId);
        writeDraft(text);
        router.push(`/verify-phone?next=/messages/${conversationId}`);
        return;
      }
      if (result.error === "NotFound" || result.error === "Forbidden") {
        // NotFound/Forbidden go to /messages list, not /messages/[id] — the
        // conversation may no longer exist OR the user isn't a participant.
        // Either way, restoring the draft on next visit isn't meaningful
        // (no thread to restore into), so we don't writeDraft here.
        failSend(conversationId, tempId);
        router.push("/messages");
        return;
      }

      // Filter / validation errors → mark bubble failed + inline banner.
      // Cache the failed content for banner Retry (TC-002). Bump retry count
      // so the 3-attempt budget escalates the banner copy after exhaustion.
      const noteFailure = () => {
        setLastFailedContent(text);
        setLastFailureRetries((n) => n + 1);
      };
      if (result.error === "ContentBlocked") {
        failSend(conversationId, tempId);
        setError(result.reason ?? "This message can't be sent.");
        noteFailure();
        setContent(text);
        return;
      }
      if (result.error === "TooLong") {
        failSend(conversationId, tempId);
        setError(`Message is too long (${MAX_LEN} character maximum).`);
        noteFailure();
        setContent(text);
        return;
      }
      if (result.error === "Empty") {
        failSend(conversationId, tempId);
        setError("Type a message first.");
        noteFailure();
        setContent(text);
        return;
      }
      if (result.error === "FilterUnavailable") {
        failSend(conversationId, tempId);
        setError("Couldn't check message safety — please try again.");
        noteFailure();
        setContent(text);
        return;
      }
      if (result.error === "Unknown") {
        failSend(conversationId, tempId);
        setError("Couldn't send. Please try again.");
        noteFailure();
        setContent(text);
        return;
      }

      // Success — swap tempId for real message via the shell + drop draft.
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
      // TC-010: successful send clears the draft stash + the failure cache.
      dropDraft();
      setLastFailedContent(null);
      setLastFailureRetries(0);

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
      setLastFailedContent(text);
      setLastFailureRetries((n) => n + 1);
      setContent(text);
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = async () => {
    if (sendDisabled) return;

    // §1.E: navigator.onLine guard. If offline, surface the inline hint and
    // do not consume any retry budget. Banner Retry path uses the same guard
    // via handleBannerRetry.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setShowOfflineHint(true);
      setError("Couldn't send. Please try again.");
      // Cache the content so the banner Retry can re-attempt later.
      setLastFailedContent(content);
      return;
    }

    // Capture text + persist BEFORE clearing the textarea. Ordering matters:
    // writeDraft must complete before setContent("") schedules the re-render
    // (8.3 fix — see helper comment above for the rationale).
    const text = content;
    writeDraft(text);
    setContent("");
    await performSend(text);
  };

  const handleBannerRetry = async () => {
    if (!lastFailedContent) return;
    if (isSending) return;
    if (lastFailureRetries >= BANNER_RETRY_BUDGET) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setShowOfflineHint(true);
      return;
    }
    setShowOfflineHint(false);
    await performSend(lastFailedContent);
  };

  // Commit 8.2: mirror the bubble's "↻ Retry · Dismiss" pair on the banner.
  // §1.B originally relied on "Dismiss is implicit — typing clears the banner,"
  // but that fell apart in the offline-attempt case: the banner appears, no
  // optimistic bubble is created (the offline guard returns before
  // optimisticSend), so the user has no bubble-level Dismiss either. Result:
  // they're stuck looking at a danger banner with only Retry, and the only
  // way to clear it is to lose their textarea draft. Dismiss clears the
  // banner state but preserves the draft — they can come back to it later.
  const handleBannerDismiss = () => {
    setError(null);
    setLastFailedContent(null);
    setLastFailureRetries(0);
    setShowOfflineHint(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setContent(next);
    // TC-010 (8.3): keep sessionStorage in sync with the user's typing.
    // Branching explicit: writeDraft persists only, dropDraft removes only.
    // The empty-by-user-action path (Backspace to empty, Ctrl+A → Delete) is
    // the ONLY legitimate keystroke-driven clear; any other observation of
    // next === "" (e.g., a synthetic onChange from a browser extension after
    // a programmatic setContent("")) would be a misfire we must not honour.
    // This handler can't distinguish "user cleared" from "extension misfire"
    // perfectly, but in the user-cleared case the textarea is already empty
    // and dropping the draft matches user intent; in the misfire case the
    // textarea STILL renders "" but the user typed something real, and the
    // defensive write in handleSend's redirect paths (performSend §) restores
    // the draft anyway right before navigation. Net: either path preserves
    // the user's content where it matters.
    if (next.length === 0) {
      dropDraft();
    } else {
      writeDraft(next);
    }
    if (error) setError(null);
    // User started typing a new message — they've moved past the previous
    // failure. Clear the banner Retry context so the stale failed-send isn't
    // offered for retry once they start a new attempt.
    if (lastFailedContent !== null && next !== lastFailedContent) {
      setLastFailedContent(null);
      setLastFailureRetries(0);
    }
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
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="flex-1">
              {lastFailureRetries >= BANNER_RETRY_BUDGET ? (
                <>
                  Couldn&apos;t send — check your connection and try again
                  later.
                </>
              ) : (
                error
              )}
            </span>
            {/* TC-002 + Commit 8.2: banner mirrors the bubble's "↻ Retry ·
                Dismiss" pair. Retry hidden when budget exhausted (escalated
                copy takes over the left span) or while a send is in flight.
                Dismiss is always available when the banner is visible — gives
                users an explicit way to clear the danger state without losing
                their textarea draft. */}
            <div className="flex items-baseline gap-2 shrink-0">
              {lastFailedContent !== null &&
                lastFailureRetries < BANNER_RETRY_BUDGET &&
                !isSending && (
                  <>
                    <button
                      type="button"
                      onClick={handleBannerRetry}
                      className="font-medium underline hover:no-underline focus:outline-none focus-visible:no-underline text-danger-text"
                      aria-label="Retry sending"
                    >
                      Retry
                    </button>
                    <span
                      className="text-danger-text/60"
                      aria-hidden="true"
                    >
                      ·
                    </span>
                  </>
                )}
              <button
                type="button"
                onClick={handleBannerDismiss}
                className="font-medium underline hover:no-underline focus:outline-none focus-visible:no-underline text-danger-text"
                aria-label="Dismiss this notice"
              >
                Dismiss
              </button>
            </div>
          </div>
          {showOfflineHint && !isOnline && (
            <div className="mt-1 text-ink-600">
              You&apos;re offline. Connect to the internet to send.
            </div>
          )}
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
