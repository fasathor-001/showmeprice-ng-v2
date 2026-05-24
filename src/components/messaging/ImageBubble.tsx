"use client";

import { useEffect, useState } from "react";
import { useClientTime } from "@/lib/use-client-time";
import { mintMessageImageUrls } from "@/lib/messaging/image-urls";
import type { ThreadImage, ThreadMessage } from "@/lib/messaging/realtime";
import { ImageViewer } from "./ImageViewer";

// Stage 2.C Commit 9 — image-message bubble.
//
// Layouts (§6, §14.D):
//   · 1 image: full-width inside bubble, max-h-80 (320px)
//   · 2 images: 2-column square grid
//   · 3 images: §14.D ShowMePrice signature — 2 small thumbs ABOVE + 1 large
//     hero BELOW. Distinct from WhatsApp's hero-above layout; matches the
//     calm vertical reading flow (thumbs → hero → caption → timestamp).
//
// Phases (driven by ThreadMessage.imagePhase, set by reducer):
//   · scheduled  — 3s send-undo grace. Grey placeholder with subtle pulse;
//                  blobUrl shown if available so user sees their pick.
//   · uploading  — per-image bottom-edge progress bar (§4.B); h-1 teal-600
//                  fill on grey track. Failed slot shows ↻ retry icon
//                  centered; × cancel in top-right.
//   · confirming — all uploads done; server-action in flight. Bubble shows
//                  the standard ⌚ pending clock next to timestamp (like text).
//   · sent       — server confirmed. Read receipts visible. Tap → viewer.
//   · failed     — caption blocked or server error. Danger border + the
//                  existing Retry · Dismiss pair from MessageBubble pattern.
//
// Calm-UI discipline (Frank's non-negotiable):
//   · Placeholders use the SAME aspect ratio throughout the lifecycle so
//     the bubble doesn't jump as compression → upload → confirm progresses.
//   · No flicker between phases — blobUrl stays visible until signedUrl
//     is resolved on first viewer open or first render after sent.
//   · No toast spam — failure feedback is inline on the slot, not as toast.

interface ImageBubbleProps {
  message: ThreadMessage;
  isCurrentUser: boolean;
  /** §14.B passes the conversation's listing context to the viewer chip. */
  listing?: {
    id: string;
    title: string;
    primaryImageUrl: string | null;
  } | null;
  /** Called when user × cancels a single image slot. */
  onRemoveSlot?: (position: number) => void;
  /** Called when user ↻ retries a failed image slot. */
  onRetrySlot?: (position: number) => void;
  /** Called on failed-state bubble Retry (caption-block or server error). */
  onRetryBubble?: () => void;
  /** Called on failed-state bubble Dismiss. */
  onDismissBubble?: () => void;
}

export function ImageBubble({
  message,
  isCurrentUser,
  listing,
  onRemoveSlot,
  onRetrySlot,
  onRetryBubble,
  onDismissBubble,
}: ImageBubbleProps) {
  const timeText = useClientTime(message.createdAt, "hhmm");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);
  // §13.B — React-state signed URL cache with expiry check.
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [signedFetchError, setSignedFetchError] = useState(false);
  const [signedExpiresAt, setSignedExpiresAt] = useState<number | null>(null);

  const images = message.images ?? [];
  const sortedImages = [...images].sort((a, b) => a.position - b.position);
  const phase = message.imagePhase ?? "sent";
  const caption = (message.content ?? "").trim();
  const isPending = phase === "scheduled" || phase === "uploading" || phase === "confirming";
  const isFailed = phase === "failed" || Boolean(message.failed);
  const isRead = Boolean(message.readAt);

  // Resolve signed URLs once when the bubble enters 'sent' phase AND the
  // images have imageIds (set after server confirm). Refetches before
  // 60-second expiry margin.
  useEffect(() => {
    if (phase !== "sent") return;
    const ids = sortedImages
      .map((img) => img.imageId)
      .filter((x): x is string => Boolean(x));
    if (ids.length === 0) return;
    // Refetch if missing OR within 60s of expiry.
    const needsFetch =
      ids.some((id) => !signedUrls[id]) ||
      (signedExpiresAt !== null && Date.now() > signedExpiresAt - 60_000);
    if (!needsFetch) return;
    let cancelled = false;
    (async () => {
      const result = await mintMessageImageUrls(ids);
      if (cancelled) return;
      if (result.error || !result.urls) {
        setSignedFetchError(true);
        return;
      }
      setSignedUrls(result.urls);
      setSignedExpiresAt(Date.now() + 4 * 60 * 1000); // 4 min safety margin
      setSignedFetchError(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sortedImages.map((i) => i.imageId).join(","), signedExpiresAt]);

  const resolveImageSrc = (img: ThreadImage): string | null => {
    // Own-bubble in pending: prefer blobUrl (instant local preview).
    if (img.blobUrl) return img.blobUrl;
    if (img.imageId && signedUrls[img.imageId]) return signedUrls[img.imageId];
    return null;
  };

  const viewerUrls = sortedImages
    .map(resolveImageSrc)
    .filter((url): url is string => Boolean(url));

  const openViewer = (i: number) => {
    if (phase !== "sent") return; // only open viewer for confirmed bubbles
    setViewerStart(i);
    setViewerOpen(true);
  };

  const alignClass = isCurrentUser ? "justify-end" : "justify-start";
  const colAlignClass = isCurrentUser ? "items-end" : "items-start";
  const bubbleClass = isFailed
    ? "bg-danger-bg text-ink border border-danger-text/40"
    : isCurrentUser
      ? "bg-teal-50 text-ink"
      : "bg-neutral-100 text-ink";
  const opacityClass = isPending ? "opacity-80" : "opacity-100";
  const showReceipt = isCurrentUser && phase === "sent" && !isFailed;

  // Build the layout JSX. Each slot is a fixed aspect-ratio square / hero
  // to keep dimensions stable through compression/upload/confirm — no
  // layout jumps per Frank's non-negotiable.
  const renderGrid = () => {
    if (sortedImages.length === 1) {
      return (
        <div className="w-full rounded-xl overflow-hidden">
          <ImageSlot
            img={sortedImages[0]!}
            src={resolveImageSrc(sortedImages[0]!)}
            phase={phase}
            onTap={() => openViewer(0)}
            onRemove={onRemoveSlot ? () => onRemoveSlot(sortedImages[0]!.position) : undefined}
            onRetry={onRetrySlot ? () => onRetrySlot(sortedImages[0]!.position) : undefined}
            aspectClass="aspect-[4/3] max-h-80"
            fetchError={signedFetchError}
          />
        </div>
      );
    }
    if (sortedImages.length === 2) {
      return (
        <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
          {sortedImages.map((img, i) => (
            <ImageSlot
              key={img.position}
              img={img}
              src={resolveImageSrc(img)}
              phase={phase}
              onTap={() => openViewer(i)}
              onRemove={onRemoveSlot ? () => onRemoveSlot(img.position) : undefined}
              onRetry={onRetrySlot ? () => onRetrySlot(img.position) : undefined}
              aspectClass="aspect-square"
              fetchError={signedFetchError}
            />
          ))}
        </div>
      );
    }
    // §14.D ShowMePrice signature — 2 small thumbs ABOVE + 1 large HERO below.
    const [first, second, third] = sortedImages;
    return (
      <div className="flex flex-col gap-1 rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 gap-1">
          <ImageSlot
            img={first!}
            src={resolveImageSrc(first!)}
            phase={phase}
            onTap={() => openViewer(0)}
            onRemove={onRemoveSlot ? () => onRemoveSlot(first!.position) : undefined}
            onRetry={onRetrySlot ? () => onRetrySlot(first!.position) : undefined}
            aspectClass="aspect-square"
            fetchError={signedFetchError}
          />
          <ImageSlot
            img={second!}
            src={resolveImageSrc(second!)}
            phase={phase}
            onTap={() => openViewer(1)}
            onRemove={onRemoveSlot ? () => onRemoveSlot(second!.position) : undefined}
            onRetry={onRetrySlot ? () => onRetrySlot(second!.position) : undefined}
            aspectClass="aspect-square"
            fetchError={signedFetchError}
          />
        </div>
        <ImageSlot
          img={third!}
          src={resolveImageSrc(third!)}
          phase={phase}
          onTap={() => openViewer(2)}
          onRemove={onRemoveSlot ? () => onRemoveSlot(third!.position) : undefined}
          onRetry={onRetrySlot ? () => onRetrySlot(third!.position) : undefined}
          aspectClass="aspect-[16/9]"
          fetchError={signedFetchError}
        />
      </div>
    );
  };

  return (
    <>
      <div className={`flex ${alignClass} mt-3`}>
        <div className={`flex flex-col max-w-[80%] sm:max-w-[65%] ${colAlignClass}`}>
          <div
            className={`rounded-2xl p-1 transition-opacity duration-200 ${bubbleClass} ${opacityClass}`}
          >
            {renderGrid()}
            {/* §8.B / §14.C — caption rendered BELOW the grid, quote-style.
                Italic ink-600 with a thin left-border accent. Distinct from
                WhatsApp's white-on-translucent overlay; legible on small
                Nigerian Android screens regardless of image content. */}
            {caption.length > 0 && (
              <div className="px-2 pt-2 pb-1">
                <div className="border-l-2 border-teal-600/40 pl-2 italic text-sm text-ink-700 break-words whitespace-pre-wrap">
                  {caption}
                </div>
              </div>
            )}
          </div>

          {/* Timestamp + receipts — mirrors text-bubble pattern. */}
          <div className="flex items-center gap-1.5 mt-0.5 px-1">
            <span className="text-xs text-ink-400">{timeText}</span>
            {isPending && (
              <svg
                viewBox="0 0 24 24"
                className="w-3 h-3 text-ink-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-label="Sending"
              >
                <circle cx="12" cy="12" r="9" />
                <path
                  d="M12 7v5l3 2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {showReceipt && !isRead && (
              <svg
                viewBox="0 0 16 12"
                className="w-3.5 h-2.5 text-ink-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-label="Sent"
              >
                <path d="M1 6.5 L5.5 11 L15 1" />
              </svg>
            )}
            {showReceipt && isRead && (
              <svg
                viewBox="0 0 22 12"
                className="w-5 h-2.5 text-teal-700"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-label="Read"
              >
                <path d="M1 6.5 L5.5 11 L13 2" />
                <path d="M9 6.5 L13 11 L21 1" />
              </svg>
            )}
          </div>

          {/* Failed-bubble Retry · Dismiss pair (matches Commit 8 pattern). */}
          {isFailed && (onRetryBubble || onDismissBubble) && (
            <div className="mt-1 flex items-center gap-2 text-xs">
              {onRetryBubble && (
                <button
                  type="button"
                  onClick={onRetryBubble}
                  className="inline-flex items-center gap-1 text-danger-text hover:underline focus:outline-none focus-visible:underline"
                  aria-label="Retry sending this message"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 1 1-3.18-6.87" />
                    <path d="M21 4v5h-5" />
                  </svg>
                  Retry
                </button>
              )}
              {onRetryBubble && onDismissBubble && (
                <span className="text-ink-400" aria-hidden="true">·</span>
              )}
              {onDismissBubble && (
                <button
                  type="button"
                  onClick={onDismissBubble}
                  className="text-ink-500 hover:text-ink hover:underline focus:outline-none focus-visible:underline"
                  aria-label="Dismiss failed message"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {viewerOpen && viewerUrls.length > 0 && (
        <ImageViewer
          urls={viewerUrls}
          startIndex={viewerStart}
          messageId={message.id}
          listing={listing}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// ImageSlot — one slot in the bubble grid. Owns the phase-specific overlay
// (progress bar, retry icon, cancel ×). Aspect-ratio set by parent.
// ---------------------------------------------------------------------------

interface ImageSlotProps {
  img: ThreadImage;
  src: string | null;
  phase: ThreadMessage["imagePhase"];
  onTap: () => void;
  onRemove?: () => void;
  onRetry?: () => void;
  aspectClass: string;
  fetchError: boolean;
}

function ImageSlot({
  img,
  src,
  phase,
  onTap,
  onRemove,
  onRetry,
  aspectClass,
  fetchError,
}: ImageSlotProps) {
  const isScheduled = phase === "scheduled";
  const isUploading = phase === "uploading";
  const isConfirming = phase === "confirming";
  const failed = Boolean(img.failed);
  const showProgress = isUploading && typeof img.progress === "number" && !failed;
  const showSchedulePulse = isScheduled && !failed;

  return (
    <div
      className={`relative ${aspectClass} bg-neutral-200 overflow-hidden`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover cursor-pointer"
          onClick={onTap}
          loading="lazy"
          draggable={false}
        />
      ) : fetchError ? (
        // §13.C — placeholder + retry hint when signed URL fetch failed.
        <button
          type="button"
          onClick={onTap}
          className="w-full h-full flex flex-col items-center justify-center text-ink-400 text-xs gap-1 hover:bg-neutral-300/40 transition-colors"
          aria-label="Couldn't load image"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="11" r="1.5" />
            <path d="M5 17l4-4 3 3 5-5 2 2" strokeLinecap="round" />
          </svg>
          <span>Tap to retry</span>
        </button>
      ) : (
        // No src yet (scheduled/uploading without blobUrl) — placeholder.
        <div className="w-full h-full" aria-hidden="true" />
      )}

      {/* §14.A scheduled pulse — subtle, calm; signals "not sent yet." */}
      {showSchedulePulse && (
        <div className="absolute inset-0 pointer-events-none bg-white/10 animate-pulse" />
      )}

      {/* §4.B per-image progress bar — h-1, teal-600 fill on grey track. */}
      {showProgress && (
        <div className="absolute left-0 right-0 bottom-0 h-1 bg-neutral-300/60 pointer-events-none">
          <div
            className="h-full bg-teal-600 transition-all duration-150"
            style={{ width: `${Math.max(0, Math.min(100, img.progress!))}%` }}
          />
        </div>
      )}

      {/* §4.C failed slot — danger border + retry overlay. */}
      {failed && (
        <>
          <div className="absolute inset-0 ring-2 ring-danger-text pointer-events-none" />
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              aria-label="Retry uploading this image"
              className="absolute inset-0 flex items-center justify-center bg-ink/40 text-white hover:bg-ink/50 focus:outline-none"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-3.18-6.87" />
                <path d="M21 4v5h-5" />
              </svg>
            </button>
          )}
        </>
      )}

      {/* §4.D × cancel — visible during uploading/scheduled phases when a
          remove handler is provided. Top-right corner; single tap removes. */}
      {(isScheduled || isUploading) && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove this image"
          className="absolute top-1 right-1 w-7 h-7 inline-flex items-center justify-center rounded-full bg-ink/60 hover:bg-ink/80 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Confirming phase — entire slot dims slightly. No per-slot indicator
          because the bubble-level ⌚ clock owns the signal. */}
      {isConfirming && (
        <div className="absolute inset-0 pointer-events-none bg-white/10" />
      )}
    </div>
  );
}
