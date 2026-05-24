"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { createConversation } from "@/lib/messaging/actions";
import { formatNaira } from "@/lib/listings";

// Stage 2.B Commit 7 — first-message composer for new conversations.
//
// Architecture (per surface findings D + E + F + I + H):
//   D. Responsive bottom-sheet on mobile (slide up from bottom) + centered
//      modal on desktop. Single component, different positioning via Tailwind.
//   E. 4 localized Nigerian-English template chips. No "Custom message"
//      chip — the textarea IS the custom option.
//   F. Tap chip → REPLACE textarea content (not append). Selected chip gets
//      filled-teal styling. User can edit; if edited, templateEdited flag is
//      sent through to createConversation for analytics.
//   I. Listing context strip at top — thumbnail + title + price + seller name.
//      Generic SVG placeholder when listing has no primary image.
//   H. Error handling mirrors MessageComposer — inline danger banner; auth
//      errors redirect; ContentBlocked surfaces D-119 reason; content preserved
//      for re-edit.
//
// Modal close behaviors: ESC key, backdrop click, X button, post-send auto-
// close (via redirect — the modal unmounts as the route changes).
//
// Animation: slide-up on mobile only (translate-y-full → translate-y-0 over
// 200ms). Reduced-motion preference respected via motion-reduce:transition-none.

const TEMPLATES = [
  { id: "available", text: "Is this still available?" },
  { id: "price", text: "Last price?" },
  { id: "location", text: "Where is the location?" },
  { id: "pictures", text: "Can I see more pictures?" },
] as const;

const MAX_LEN = 2000;

interface MessageSellerModalProps {
  listingId: string;
  listingTitle: string;
  listingPriceKobo: number;
  listingPrimaryImageUrl: string | null;
  sellerBusinessName: string;
  onClose: () => void;
}

function ListingPlaceholder() {
  return (
    <div
      className="flex items-center justify-center w-12 h-12 rounded-lg bg-neutral-100 shrink-0"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="w-5 h-5 text-neutral-400"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="11" r="1.5" />
        <path
          d="M5 17l4-4 3 3 5-5 2 2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function MessageSellerModal({
  listingId,
  listingTitle,
  listingPriceKobo,
  listingPrimaryImageUrl,
  sellerBusinessName,
  onClose,
}: MessageSellerModalProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templateEdited, setTemplateEdited] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animateIn, setAnimateIn] = useState(false);

  // Trigger slide-up on next paint so the initial render is below the viewport
  // (translate-y-full), then animateIn flips → translate-y-0 → slides up.
  useEffect(() => {
    requestAnimationFrame(() => setAnimateIn(true));
    textareaRef.current?.focus();
  }, []);

  // ESC closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleChipTap = (templateId: string, text: string) => {
    // F refinement: REPLACE textarea content (not append). User can always
    // type custom afterward.
    setContent(text);
    setSelectedTemplate(templateId);
    setTemplateEdited(false);
    if (error) setError(null);
    textareaRef.current?.focus();
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setContent(next);
    if (error) setError(null);
    // If the user types something different from the selected template's
    // text, mark templateEdited so analytics can distinguish "tapped chip +
    // sent as-is" from "tapped chip + edited the wording".
    if (selectedTemplate) {
      const tpl = TEMPLATES.find((t) => t.id === selectedTemplate);
      setTemplateEdited(Boolean(tpl && next !== tpl.text));
    }
  };

  const handleSend = async () => {
    const text = content.trim();
    if (text.length === 0 || isSending) return;
    if (text.length > MAX_LEN) {
      setError(`Message is too long (${MAX_LEN} character maximum).`);
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const result = await createConversation(
        listingId,
        text,
        selectedTemplate ?? undefined,
        templateEdited || undefined,
      );

      // Auth / participation errors → redirect (backstops; the button gates
      // these states upfront).
      if (result.error === "Unauthorized") {
        router.push(`/sign-in?next=/listings/${listingId}`);
        return;
      }
      if (result.error === "PhoneVerificationRequired") {
        router.push(`/verify-phone?next=/listings/${listingId}`);
        return;
      }

      if (result.error === "NotFound") {
        setError("This listing is no longer available.");
        return;
      }
      if (result.error === "Forbidden") {
        // Should be unreachable — button is hidden for own listings.
        setError("You can't message yourself.");
        return;
      }
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

      // Success — redirect to the new thread. Modal unmounts on navigation.
      if (result.conversationId) {
        router.push(`/messages/${result.conversationId}`);
      }
    } catch (err) {
      console.error("[MessageSellerModal] send failed", err);
      setError("Couldn't send. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const isEmpty = content.trim().length === 0;
  const isOverLimit = content.length > MAX_LEN;
  const sendDisabled = isEmpty || isOverLimit || isSending;

  return (
    <div
      className="fixed inset-0 z-50 flex sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="message-seller-title"
    >
      {/* Backdrop. Tap to close. Fades in. */}
      <button
        type="button"
        className={`absolute inset-0 bg-ink/40 transition-opacity duration-200 motion-reduce:transition-none ${animateIn ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-label="Close"
        tabIndex={-1}
      />

      {/* Modal/sheet. Mobile: full-width bottom-sheet sliding up. Desktop:
          centered card. mt-auto on mobile anchors to bottom; sm:my-auto
          centers on desktop. */}
      <div
        className={`relative bg-white shadow-xl flex flex-col
                    w-full sm:w-[480px] sm:max-w-[calc(100vw-2rem)]
                    rounded-t-2xl sm:rounded-2xl
                    mt-auto sm:my-auto
                    max-h-[85vh] sm:max-h-[90vh]
                    transition-transform duration-200 ease-out motion-reduce:transition-none
                    ${animateIn ? "translate-y-0" : "translate-y-full sm:translate-y-0"}`}
      >
        {/* Header — title + close button (44×44 touch target). */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 shrink-0">
          <h2
            id="message-seller-title"
            className="text-base font-semibold text-ink"
          >
            Message seller
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-10 h-10 -mr-2 rounded-lg text-ink-600 hover:bg-neutral-100 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Listing context strip — keeps the user oriented to what they're
            messaging about, especially when they tapped the sticky-bottom
            button from somewhere far down the listing page. */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-200 bg-neutral-50 shrink-0">
          {listingPrimaryImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listingPrimaryImageUrl}
              alt=""
              className="w-12 h-12 rounded-lg object-cover bg-neutral-200 shrink-0"
              loading="lazy"
            />
          ) : (
            <ListingPlaceholder />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-ink truncate">
              {listingTitle}
            </div>
            <div className="text-xs text-ink-600 mt-0.5 truncate">
              <span className="font-medium text-teal-700">
                {formatNaira(listingPriceKobo)}
              </span>
              <span> · </span>
              <span>{sellerBusinessName}</span>
            </div>
          </div>
        </div>

        {/* Scrollable body — chips + textarea. */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          {/* Template chips. 4 localized Nigerian-English starters per D-108. */}
          <div className="flex flex-wrap gap-2 mb-3">
            {TEMPLATES.map((t) => {
              const active = selectedTemplate === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleChipTap(t.id, t.text)}
                  disabled={isSending}
                  className={`inline-flex items-center px-3 h-10 rounded-full text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:opacity-60 disabled:cursor-not-allowed ${
                    active
                      ? "bg-teal-600 text-white"
                      : "bg-neutral-100 text-ink-600 hover:bg-neutral-200"
                  }`}
                >
                  {t.text}
                </button>
              );
            })}
          </div>

          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            placeholder="Type your message…"
            rows={4}
            enterKeyHint="send"
            disabled={isSending}
            className={`w-full resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:bg-neutral-50 disabled:cursor-not-allowed ${
              isOverLimit
                ? "border-danger-text focus:ring-danger-text focus:border-danger-text"
                : "border-neutral-200 focus:ring-teal-400 focus:border-teal-400"
            }`}
            aria-label="Message"
            aria-invalid={isOverLimit || Boolean(error)}
          />

          {error && (
            <div
              role="alert"
              className="mt-3 px-3 py-2 rounded-lg bg-danger-bg text-danger-text text-xs"
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer — send button. */}
        <div className="px-4 py-3 border-t border-neutral-200 bg-white shrink-0">
          <Button
            variant="primary"
            size="md"
            onClick={handleSend}
            disabled={sendDisabled}
            fullWidth
            aria-label="Send message"
          >
            {isSending ? "Sending…" : "Send message"}
          </Button>
        </div>
      </div>
    </div>
  );
}
