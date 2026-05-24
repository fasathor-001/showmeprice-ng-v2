"use client";

import { useRef, useState, type ChangeEvent } from "react";

// Stage 2.C Commit 9-c — §1.B image-attach affordance.
//
// Camera icon (NOT paperclip — signals "product photos," reinforces the
// marketplace framing per Frank's marketplace-native discipline) with a
// small teal-600 accent dot at top-right corner.
//
// Accent dot constraints (Frank locked, non-negotiable):
//   · teal-600 only (NOT red/yellow/alert-coloured)
//   · 4-6px visual weight (1.5 Tailwind unit = 6px; we use w-1.5 h-1.5)
//   · top-right CORNER (decoration), NOT center-right (would read as
//     notification badge)
//   · falls back to icon-alone if it ever reads as badge — accept the
//     `accent={false}` prop to drop the dot without touching the icon
//
// 40×40 button with effective hit-area via surrounding flex gap ≥44px in
// practice (matches existing UI density of other icon buttons in header).

interface ImageAttachButtonProps {
  /** Disabled when bubble already has 3 images, or send is in flight. */
  disabled?: boolean;
  /** Fires once with user-selected File[] — caller compresses + previews. */
  onFilesPicked: (files: File[]) => void;
  /** Frank-locked fallback — drop the dot if it starts feeling badge-y. */
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
      // §1.C — disabled-state acknowledgment hint.
      setShowLimitHint(true);
      setTimeout(() => setShowLimitHint(false), 3000);
      return;
    }
    inputRef.current?.click();
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // reset so picking same file twice still fires onChange
    if (files.length === 0) return;
    onFilesPicked(files);
  };

  return (
    <div className="relative shrink-0">
      <input
        ref={inputRef}
        type="file"
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
        {/* Camera icon — line weight matches existing send-arrow weight. */}
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
            "decoration." 6px (w-1.5 h-1.5) keeps under badge threshold.
            Drop via `accent={false}` if it starts feeling notification-y. */}
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
