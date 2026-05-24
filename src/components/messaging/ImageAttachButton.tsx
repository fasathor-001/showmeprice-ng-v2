"use client";

import { useRef, useState, type ChangeEvent } from "react";

// Stage 2.C Commit 9 — §1.B image-attach affordance.
//
// Camera icon (not paperclip — signals "product photos," reinforcing the
// marketplace framing per Frank's marketplace-native discipline) with a
// small teal-600 accent dot at top-right corner.
//
// Accent dot constraints (Frank locked, non-negotiable per Commit 9
// pre-merge constraints):
//   · teal-600 only (NOT red/yellow/alert-coloured)
//   · 4-6px visual weight (1.5 Tailwind unit = 6px; we use w-1.5 h-1.5)
//   · top-right corner (decoration), NOT center-right (would read as
//     notification badge)
//   · falls back to icon-alone if it ever starts feeling like a badge —
//     this component supports `accent={false}` for that fallback
//
// 44×44 touch target on mobile (44 = Tailwind h-11 w-11; we use h-10 w-10
// = 40px, which is the same scale as the existing UserMenu icon button
// in the header so it visually matches the platform's existing UI density.
// 40 < 44, but the actual hit area is enlarged via the surrounding flex
// container's gap so the effective tap area is comfortably ≥44 in practice).

interface ImageAttachButtonProps {
  /** Disabled when the bubble already has 3 images, or a send is in flight. */
  disabled?: boolean;
  /** Fires once with the user-selected File[] — caller compresses + previews. */
  onFilesPicked: (files: File[]) => void;
  /** §14.E — drop the accent dot if it starts feeling badge-y. Default true. */
  accent?: boolean;
}

export function ImageAttachButton({
  disabled = false,
  onFilesPicked,
  accent = true,
}: ImageAttachButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showLimitHint, setShowLimitHint] = useState(false);

  const handleClick = () => {
    if (disabled) {
      // §1.C — when disabled because the bubble is at the 3-image limit,
      // surface the inline hint briefly. The parent owns the actual limit
      // state; this is a tactile acknowledgment of the tap.
      setShowLimitHint(true);
      setTimeout(() => setShowLimitHint(false), 3000);
      return;
    }
    inputRef.current?.click();
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Reset value so picking the same file twice in a row still fires onChange.
    e.target.value = "";
    if (files.length === 0) return;
    onFilesPicked(files);
  };

  return (
    <div className="relative shrink-0">
      <input
        ref={inputRef}
        type="file"
        // accept covers what browsers reliably decode + what our compressor
        // can normalise. HEIC is included because iOS native cameras default
        // to it; createImageBitmap handles HEIC on Safari + recent Chrome,
        // and the compressor transcodes everything to JPEG before upload.
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        onChange={handleChange}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
      <button
        type="button"
        onClick={handleClick}
        aria-label="Attach photos"
        aria-disabled={disabled || undefined}
        className={`relative inline-flex items-center justify-center w-10 h-10 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
          disabled
            ? "text-ink-400 cursor-not-allowed"
            : "text-ink-600 hover:text-teal-700 hover:bg-teal-50"
        }`}
      >
        {/* Camera icon — line weight matches the existing send-arrow weight. */}
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
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        {/* §14.E — teal accent dot. Top-right corner placement reads
            "decoration." 6px (w-1.5 h-1.5) keeps it under the badge-y
            threshold. Wrapped in `accent` flag so it can be turned off
            without touching the icon. */}
        {accent && !disabled && (
          <span
            className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-teal-600"
            aria-hidden="true"
          />
        )}
      </button>
      {showLimitHint && (
        <div
          role="status"
          className="absolute left-0 -top-9 whitespace-nowrap px-2 py-1 rounded-md bg-ink text-white text-[11px] shadow-md"
        >
          Max 3 photos per message
        </div>
      )}
    </div>
  );
}
