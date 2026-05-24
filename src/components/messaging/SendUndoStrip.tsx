"use client";

import { useEffect, useState } from "react";

// Stage 2.C Commit 9 — §14.A send-with-undo grace period.
//
// 3-second window AFTER user taps Send on an image message. Uploads do
// NOT begin yet (locked per Frank's clarification — load-bearing for
// clean cancellation: no orphan Storage objects). The optimistic bubble
// is visible in 'scheduled' phase during the grace window.
//
// Trade-off documented: 3s of perceived send latency in exchange for
// zero-orphan cleanliness. Gmail's Undo Send pattern. Differentiates from
// WhatsApp's instant-fire pattern; adds genuine trust value (prevents
// accidental wrong-photo sends mid-negotiation).
//
// On Undo OR on unmount: parent's `onCancel` fires (composer removes the
// optimistic bubble + restores attachments to compose state).
// On timeout elapse: parent's `onProceed` fires (transition to uploading).
// Both handlers are idempotent — parent owns the source-of-truth state.

const GRACE_MS = 3_000;

interface SendUndoStripProps {
  onCancel: () => void;
  onProceed: () => void;
}

export function SendUndoStrip({ onCancel, onProceed }: SendUndoStripProps) {
  const [remaining, setRemaining] = useState(GRACE_MS);

  useEffect(() => {
    const startedAt = Date.now();
    // Drive a 250ms-resolution countdown for the inline label without
    // burning CPU (we don't need 60fps for a 3s timer).
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const left = Math.max(0, GRACE_MS - elapsed);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(tick);
      }
    }, 250);
    const expire = setTimeout(() => {
      onProceed();
    }, GRACE_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(expire);
    };
    // onProceed is captured at mount; subsequent identity changes don't
    // re-arm the timer (parent must remount the strip to reset).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const secondsLeft = Math.ceil(remaining / 1000);

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-2 px-3 py-2 rounded-lg bg-teal-50 border border-teal-100 text-xs flex items-center justify-between gap-3"
    >
      <span className="text-teal-800 flex items-center gap-2">
        <span
          className="inline-flex w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse"
          aria-hidden="true"
        />
        Sending in {secondsLeft}s…
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="font-medium text-teal-700 underline hover:no-underline focus:outline-none focus-visible:no-underline"
        aria-label="Undo send"
      >
        Undo
      </button>
    </div>
  );
}
