"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import Link from "next/link";
import { ReportImageSheet } from "./ReportImageSheet";

// Stage 2.C Commit 9-b — full-screen image viewer (read-only).
//
// Locked design decisions from original surface findings:
//   §7.A  backdrop ink/95 + top bar (close × · listing chip · counter · overflow ⋯)
//   §7.B  swipe (mobile) + ◀ ▶ arrows + ← → keys (desktop)
//   §7.C  browser-back wires to close viewer (history.pushState + popstate)
//   §7.D  native browser pinch-zoom only (no custom zoom)
//   §14.B listing-context chip in top bar — marketplace framing
//
// 9.1 cleanup logic carried forward: if the viewer is closed via the
// × button / backdrop tap / ESC key (programmatic close), we pop the
// pushed history entry ourselves so the user's history is clean. If the
// viewer is closed via browser back (popstate listener fires), the entry
// is already popped by the browser — DON'T pop again or we'd consume a
// real history entry the user wants to navigate to. Tracked via the
// `pushedHistory` ref.
//
// Read-only step: no submit-handling logic on Report — that's wired to a
// placeholder submit inside ReportImageSheet (the real reportMessage()
// server action ships in 9-c).

const SWIPE_THRESHOLD = 50; // px — empirically calm; not too sensitive

interface ImageViewerProps {
  /** Resolved signed URLs in display order. Missing entries render the placeholder. */
  urls: Array<string | null>;
  /** Index to open at first. */
  startIndex: number;
  /** Source message id — for reporting. */
  messageId: string;
  /** §14.B: listing context shown as a chip in the top bar. */
  listing?: {
    id: string;
    title: string;
    primaryImageUrl: string | null;
  } | null;
  onClose: () => void;
}

export function ImageViewer({
  urls,
  startIndex,
  messageId,
  listing,
  onClose,
}: ImageViewerProps) {
  const [index, setIndex] = useState(
    Math.min(Math.max(startIndex, 0), Math.max(urls.length - 1, 0)),
  );
  const [reportOpen, setReportOpen] = useState(false);
  const [reportToast, setReportToast] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const pushedHistory = useRef(false);

  const total = urls.length;
  const canPrev = index > 0;
  const canNext = index < total - 1;

  const goPrev = useCallback(() => {
    if (canPrev) setIndex((i) => i - 1);
  }, [canPrev]);
  const goNext = useCallback(() => {
    if (canNext) setIndex((i) => i + 1);
  }, [canNext]);

  // §7.C close behaviors: keyboard (ESC, arrows).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, goPrev, goNext]);

  // Browser-back wiring. Push a state entry on mount so back-navigation
  // first closes the viewer instead of the conversation. On unmount via
  // programmatic close (× / backdrop / ESC) — pop our entry ourselves.
  // On unmount via browser back — popstate handler fires, sets the ref
  // false, then unmount skips the .back() call. Carried from 9.1
  // verbatim — Gate 2 verified the cleanup is correct.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.pushState({ viewer: true }, "");
    pushedHistory.current = true;
    const onPop = () => {
      pushedHistory.current = false; // browser already popped our entry
      onClose();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // If we still own the pushed entry (closed via × / backdrop / ESC),
      // pop it so the user's history is clean.
      if (pushedHistory.current) {
        window.history.back();
      }
    };
  }, [onClose]);

  // §7.B touch swipe navigation on mobile.
  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    if (delta > 0) goPrev();
    else goNext();
  };

  if (total === 0) return null;
  const currentUrl = urls[index];

  return (
    <div
      className="fixed inset-0 z-[55] bg-ink/95 flex flex-col motion-reduce:transition-none"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      {/* Top bar (h-12). Close · listing chip · counter · overflow. */}
      <div className="shrink-0 h-12 px-2 sm:px-4 flex items-center justify-between gap-2 text-white">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close viewer"
          className="inline-flex items-center justify-center w-11 h-11 rounded-lg hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
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
        {/* §14.B listing context chip. */}
        {listing && (
          <Link
            href={`/listings/${listing.id}`}
            className="flex-1 min-w-0 inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-colors max-w-[18rem]"
            aria-label={`Open listing ${listing.title}`}
          >
            {listing.primaryImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={listing.primaryImageUrl}
                alt=""
                className="w-6 h-6 rounded object-cover bg-white/20 shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="w-6 h-6 rounded bg-white/20 shrink-0" />
            )}
            <span className="text-xs truncate text-white/90">
              {listing.title}
            </span>
          </Link>
        )}
        <div className="text-xs text-white/80 tabular-nums px-2 shrink-0">
          {index + 1} / {total}
        </div>
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          aria-label="More options"
          className="inline-flex items-center justify-center w-11 h-11 rounded-lg hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>
      </div>

      {/* Image area — flex-1, image contained to remaining viewport. */}
      <div
        className="flex-1 min-h-0 flex items-center justify-center relative px-2"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt=""
            className="max-w-full max-h-full object-contain select-none"
            draggable={false}
          />
        ) : (
          <div className="text-white/60 text-sm text-center px-4">
            Couldn&apos;t load this image. Tap × to close.
          </div>
        )}
        {canPrev && (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous image"
            className="hidden sm:inline-flex absolute left-2 top-1/2 -translate-y-1/2 items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
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
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        {canNext && (
          <button
            type="button"
            onClick={goNext}
            aria-label="Next image"
            className="hidden sm:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
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
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        )}
      </div>

      {/* §10.D inline report acknowledgment — calm UI, not a global toast. */}
      {reportToast && (
        <div
          role="status"
          className="absolute left-1/2 -translate-x-1/2 bottom-8 px-4 py-2 rounded-full bg-white/95 text-ink-800 text-sm shadow-lg"
        >
          Reported — we&apos;ll review.
        </div>
      )}

      {reportOpen && (
        <ReportImageSheet
          messageId={messageId}
          onClose={() => setReportOpen(false)}
          onSubmitted={() => {
            setReportOpen(false);
            setReportToast(true);
            setTimeout(() => setReportToast(false), 3000);
          }}
        />
      )}
    </div>
  );
}
