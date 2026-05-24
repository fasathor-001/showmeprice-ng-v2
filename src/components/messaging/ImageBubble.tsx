"use client";

import { useEffect, useState } from "react";
import { useClientTime } from "@/lib/use-client-time";
import { mintMessageImageUrls } from "@/lib/messaging/image-urls";
import type {
  ImageMessagePhase,
  ThreadImage,
  ThreadMessage,
} from "@/lib/messaging/realtime";
import { ImageViewer } from "./ImageViewer";
import { useMessagesShell } from "./MessagesShell";

// Stage 2.C Commit 9-b — image-message bubble (read-only).
//
// Layouts (locked from original §6 + §14.D):
//   · 1 image: full-width inside bubble, max-h-80 (320px)
//   · 2 images: 2-column square grid
//   · 3 images: §14.D ShowMePrice signature — 2 small thumbs ABOVE + 1
//     large hero BELOW. Distinct from WhatsApp's hero-above layout;
//     pairs with the caption-below quote-style for calm vertical flow.
//
// Phases (driven by ThreadMessage.imagePhase, set by 9-c sender path or
// 9-d recipient lazy-fetch — NOT populated in 9-b):
//   · undefined / 'sent' — normal render of confirmed images
//   · 'scheduled' / 'uploading' / 'confirming' — placeholder phase
//     (9-b shows pulse; 9-c will populate progress bars + retry overlays)
//   · 'failed' — danger border + Retry/Dismiss (9-c wires the handlers)
//
// 9-b DORMANT BEHAVIOR (per replan 9-b.N1 + 9-b.N2 + 9-b.N6):
// When `message.messageType === 'image'` but `images` is empty/undefined,
// the bubble renders a placeholder pulse (calm) + worst-case "📷 Photo"
// inline text inside the bubble. This handles:
//   · pre-9-d: any recipient who receives an image-type message via
//     realtime sees the placeholder until 9-d ships
//   · post-9-d cold load: brief placeholder until lazy-fetch completes
//   · admin-inserted test rows: render gracefully without crash
//
// 9.1 defensive guards (locked, carried forward):
//   · explicit length === 0/1/2/3 branches; no unguarded else
//   · per-branch existence checks before destructured use; no `!`
//     runtime-meaningless assertions
//   · empty/malformed images array bails to placeholder render, not crash
//
// Signed URL caching (per replan 9-b.N3):
//   · per-bubble React state (NOT module-level shared cache)
//   · refetch when current time > expiresAt - 60s margin
//   · mintMessageImageUrls returns { error: 'Forbidden' } when the
//     feature flag is off (per 9-a.N3) — bubble falls back to
//     placeholder + "Tap to retry" gracefully

// Signed URL TTL is 5 minutes server-side; we refetch with 60s safety margin.
const SIGNED_URL_REFETCH_MARGIN_MS = 60_000;
const SIGNED_URL_TTL_MS = 4 * 60 * 1000; // 4 min cache (5 min server TTL - 1 min)

interface ImageBubbleProps {
  message: ThreadMessage;
  isCurrentUser: boolean;
  /** §14.B — listing context for the viewer's top-bar chip. */
  listing?: {
    id: string;
    title: string;
    primaryImageUrl: string | null;
  } | null;
}

export function ImageBubble({
  message,
  isCurrentUser,
  listing,
}: ImageBubbleProps) {
  const timeText = useClientTime(message.createdAt, "hhmm");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);
  // 9-b.N3 per-bubble signed URL cache. Local React state; not module-level.
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [signedExpiresAt, setSignedExpiresAt] = useState<number | null>(null);
  const [signedFetchError, setSignedFetchError] = useState(false);

  // 9-d — refetchMessageImages context method for the "no images yet"
  // retry path (placeholder shell tap). Distinct from the slot-level
  // signed-URL retry (which clears local state to re-trigger
  // mintMessageImageUrls). Decoupled so each retry path targets the
  // correct failure mode.
  //
  // 9-c — uploadingMessages map provides composer-driven upload state
  // (phase + per-image progress/failed) for the sender's own pending
  // bubbles. When a matching entry exists for this bubble's id (=
  // tempId), it OVERRIDES the reducer-derived imagePhase + per-image
  // progress fields. Dual-data-source render per 9-c.N1: reducer for
  // existence/structure, composer state for upload UI.
  const { refetchMessageImages, uploadingMessages } = useMessagesShell();
  const uploadState = uploadingMessages[message.id];

  // 9-c.N1 dual-data-source render. When composer has an upload entry
  // for this bubble's id, its phase + per-image progress/failed override
  // the reducer-derived data. Otherwise use reducer state (server-truth
  // or 9-d lazy-fetched).
  //
  // uploadState.images carries the composer-local upload fields (blob,
  // abortController, etc.) — those aren't needed for render. Map to the
  // narrower ThreadImage shape inline so downstream code sees a
  // consistent type regardless of source.
  const baseImages = message.images ?? [];
  const sortedImages: ThreadImage[] = uploadState
    ? [...uploadState.images]
        .sort((a, b) => a.position - b.position)
        .map((img): ThreadImage => ({
          position: img.position,
          width: img.width,
          height: img.height,
          blobUrl: img.blobUrl,
          storagePath: img.storagePath,
          progress: img.progress,
          failed: img.failed,
        }))
    : [...baseImages].sort((a, b) => a.position - b.position);
  const phase: ImageMessagePhase = uploadState
    ? uploadState.phase
    : (message.imagePhase ?? "sent");
  const caption = (message.content ?? "").trim();
  const isPending =
    phase === "scheduled" || phase === "uploading" || phase === "confirming";
  const isFailed = phase === "failed" || Boolean(message.failed);
  const isRead = Boolean(message.readAt);
  const showReceipt = isCurrentUser && phase === "sent" && !isFailed;

  // 9-b.N2 — when message_type === 'image' but no images yet (recipient
  // pre-9-d, cold load before JOIN, or admin test row), we still need a
  // bubble shell to render. Detect this here for the worst-case fallback.
  const hasNoImageData = sortedImages.length === 0;

  // Resolve signed URLs once when bubble enters 'sent' phase AND images
  // have imageId. Refetches before 60s expiry margin. 9-b: no code path
  // populates imageId yet — this effect is dormant until 9-d ships JOIN
  // logic. Kept here for the eventual happy path.
  useEffect(() => {
    if (phase !== "sent") return;
    const ids = sortedImages
      .map((img) => img.imageId)
      .filter((x): x is string => Boolean(x));
    if (ids.length === 0) return;
    const needsFetch =
      ids.some((id) => !signedUrls[id]) ||
      (signedExpiresAt !== null &&
        Date.now() > signedExpiresAt - SIGNED_URL_REFETCH_MARGIN_MS);
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
      setSignedExpiresAt(Date.now() + SIGNED_URL_TTL_MS);
      setSignedFetchError(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sortedImages.map((i) => i.imageId).join(","), signedExpiresAt]);

  const resolveImageSrc = (img: ThreadImage): string | null => {
    // Sender's pending bubble (9-c): prefer blobUrl for instant local preview.
    if (img.blobUrl) return img.blobUrl;
    // Confirmed sender bubble OR recipient after lazy-fetch + URL mint:
    // signed URL from React-state cache.
    if (img.imageId && signedUrls[img.imageId]) return signedUrls[img.imageId];
    return null;
  };

  const viewerUrls = sortedImages.map(resolveImageSrc);

  const openViewer = (i: number) => {
    if (phase !== "sent") return; // viewer only opens for confirmed bubbles
    if (hasNoImageData) return;
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

  // 9-b.N2 + 9-b.N6 — placeholder render path when no image data has
  // arrived yet (recipient pre-9-d cold load, lazy-fetch in flight, OR
  // an admin test row without companion message_images). Bubble shell
  // renders with a calm pulse + worst-case "📷 Photo" text + the
  // caption (if present). 9-d.N5: tap fires refetchMessageImages so the
  // user can retry if the lazy-fetch failed transiently. NEVER crashes;
  // never silently null-renders.
  const handlePlaceholderTap = () => {
    refetchMessageImages(message.conversationId, message.id);
  };
  const renderPlaceholderShell = () => (
    <button
      type="button"
      onClick={handlePlaceholderTap}
      aria-label="Tap to retry loading photo"
      className="w-full rounded-xl overflow-hidden aspect-[4/3] max-h-80 bg-neutral-200 relative focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 hover:bg-neutral-300/40 transition-colors"
    >
      <div
        className="absolute inset-0 bg-white/10 animate-pulse"
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center text-ink-500 text-sm">
        <span>📷 Photo</span>
      </div>
    </button>
  );

  // 9-d slot-level retry — clears local signed-URL state to re-trigger
  // the mintMessageImageUrls useEffect. Distinct from the placeholder
  // shell retry (which calls the server action for fresh image-data).
  // The signed URL TTL may have expired between renders, or the network
  // blipped — clearing local state lets the effect re-run.
  const handleSignedUrlRetry = () => {
    setSignedFetchError(false);
    setSignedUrls({});
    setSignedExpiresAt(null);
  };

  // 9-d slot tap dispatcher — branches between open-viewer (happy path)
  // and signed-URL retry (when local mint failed). Passed to every
  // ImageSlot so the same handler handles both cases.
  const handleSlotTap = (i: number) => {
    if (signedFetchError) {
      handleSignedUrlRetry();
    } else {
      openViewer(i);
    }
  };

  // 9.1 defensive guards: explicit length-based branches, per-branch
  // existence checks. No unguarded else; no runtime-meaningless `!`.
  const renderGrid = () => {
    if (hasNoImageData) return renderPlaceholderShell();
    if (sortedImages.length === 1) {
      const only = sortedImages[0];
      if (!only) return renderPlaceholderShell();
      return (
        <div className="w-full rounded-xl overflow-hidden">
          <ImageSlot
            img={only}
            src={resolveImageSrc(only)}
            phase={phase}
            onTap={() => handleSlotTap(0)}
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
              onTap={() => handleSlotTap(i)}
              aspectClass="aspect-square"
              fetchError={signedFetchError}
            />
          ))}
        </div>
      );
    }
    // §14.D — 2 small thumbs above + 1 large hero below.
    if (sortedImages.length === 3) {
      const [first, second, third] = sortedImages;
      if (!first || !second || !third) return renderPlaceholderShell();
      return (
        <div className="flex flex-col gap-1 rounded-xl overflow-hidden">
          <div className="grid grid-cols-2 gap-1">
            <ImageSlot
              img={first}
              src={resolveImageSrc(first)}
              phase={phase}
              onTap={() => handleSlotTap(0)}
              aspectClass="aspect-square"
              fetchError={signedFetchError}
            />
            <ImageSlot
              img={second}
              src={resolveImageSrc(second)}
              phase={phase}
              onTap={() => handleSlotTap(1)}
              aspectClass="aspect-square"
              fetchError={signedFetchError}
            />
          </div>
          <ImageSlot
            img={third}
            src={resolveImageSrc(third)}
            phase={phase}
            onTap={() => handleSlotTap(2)}
            aspectClass="aspect-[16/9]"
            fetchError={signedFetchError}
          />
        </div>
      );
    }
    // Out-of-bounds (>3): CHECK constraint on message_images.position
    // blocks this at the DB level. Defense in depth: render placeholder
    // rather than fall through into an unguarded branch.
    return renderPlaceholderShell();
  };

  return (
    <>
      <div className={`flex ${alignClass} mt-3`}>
        <div
          className={`flex flex-col max-w-[80%] sm:max-w-[65%] ${colAlignClass}`}
        >
          <div
            className={`rounded-2xl p-1 transition-opacity duration-200 ${bubbleClass} ${opacityClass}`}
          >
            {renderGrid()}
            {/* §8.B / §14.C — caption-below-grid quote-style. Italic
                ink-700 with thin teal-600/40 left-border accent. */}
            {caption.length > 0 && (
              <div className="px-2 pt-2 pb-1">
                <div className="border-l-2 border-teal-600/40 pl-2 italic text-sm text-ink-700 break-words whitespace-pre-wrap">
                  {caption}
                </div>
              </div>
            )}
          </div>

          {/* Timestamp + receipts — mirrors text-bubble pattern from MessageBubble. */}
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
        </div>
      </div>

      {viewerOpen && !hasNoImageData && (
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
// ImageSlot — one slot in the bubble grid. 9-b read-only: no per-slot
// retry/cancel overlays (those ship in 9-c when uploads are active).
// ---------------------------------------------------------------------------

interface ImageSlotProps {
  img: ThreadImage;
  src: string | null;
  phase: ImageMessagePhase;
  onTap: () => void;
  aspectClass: string;
  fetchError: boolean;
}

function ImageSlot({
  img,
  src,
  phase,
  onTap,
  aspectClass,
  fetchError,
}: ImageSlotProps) {
  const isScheduled = phase === "scheduled";
  const isUploading = phase === "uploading";
  const isConfirming = phase === "confirming";
  const failed = Boolean(img.failed);
  const showProgress =
    isUploading && typeof img.progress === "number" && !failed;
  const showSchedulePulse = isScheduled && !failed;

  return (
    <div className={`relative ${aspectClass} bg-neutral-200 overflow-hidden`}>
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
        // 9-c.2 fix — signed-URL mint in progress on cold load.
        // (9-c.1 attempted this with a gradient using ink-50/ink-100
        // classes that don't exist in this project's Tailwind config,
        // so the shimmer was invisible. Tracked separately as K-058.)
        //
        // Flat neutral-300 + animate-pulse is the canonical Tailwind
        // skeleton pattern. Slot wrapper has bg-neutral-200; this
        // inner div is one shade darker (neutral-300). animate-pulse
        // fades opacity 1.0 → 0.5 → 1.0, making it appear to "breathe"
        // between visible (neutral-300) and apparently lighter
        // (50% opacity over neutral-200 parent). Calm shimmer effect
        // using only guaranteed-defined Tailwind default classes.
        //
        // Distinct from §13.C "Tap to retry" branch above: that's the
        // FAILED state (fetchError === true). This is the IN-PROGRESS
        // state — transient, will resolve when the signed URL arrives.
        // No retry affordance here; no text; no icon.
        <div
          className="w-full h-full bg-neutral-300 animate-pulse"
          aria-label="Loading photo"
        />
      )}

      {/* Scheduled pulse — subtle, calm; signals "not sent yet". (9-c) */}
      {showSchedulePulse && (
        <div className="absolute inset-0 pointer-events-none bg-white/10 animate-pulse" />
      )}

      {/* Per-image progress bar — h-1, teal-600 fill. (9-c populates progress.) */}
      {showProgress && (
        <div className="absolute left-0 right-0 bottom-0 h-1 bg-neutral-300/60 pointer-events-none">
          <div
            className="h-full bg-teal-600 transition-all duration-150"
            style={{ width: `${Math.max(0, Math.min(100, img.progress!))}%` }}
          />
        </div>
      )}

      {/* Failed slot — danger ring. (Retry overlay ships in 9-c with handlers.) */}
      {failed && (
        <div className="absolute inset-0 ring-2 ring-danger-text pointer-events-none" />
      )}

      {/* Confirming phase — slot dims slightly; bubble-level clock owns the signal. */}
      {isConfirming && (
        <div className="absolute inset-0 pointer-events-none bg-white/10" />
      )}
    </div>
  );
}
