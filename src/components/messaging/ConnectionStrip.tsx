"use client";

import { useEffect, useRef, useState } from "react";

// Stage 2.C Commit 8 — TC-011 Reconnecting strip.
//
// Renders a thin, calm strip above the messaging shell when the Supabase
// Realtime channel status leaves SUBSCRIBED. Threshold: 2 seconds — micro-
// flaps (CHANNEL_ERROR → SUBSCRIBED within <2s) never render the strip.
//
// Visual treatment per §5.C surface findings: neutral palette (ink-100 bg,
// ink-500 text, animate-pulse on the dot). NOT warning yellow / danger red —
// reconnection is transient automatic recovery, not a broken state.
//
// On reconnect: strip slide-up disappears over 150ms (CSS transition on
// height + opacity). No toast, no "Reconnected!" message — connection back
// IS the confirmation.

const THRESHOLD_MS = 2_000;

interface ConnectionStripProps {
  /** True when the realtime channel status != "SUBSCRIBED". */
  isReconnecting: boolean;
}

export function ConnectionStrip({ isReconnecting }: ConnectionStripProps) {
  // Visible-after-threshold state: only show the strip once the disconnected
  // state has persisted past THRESHOLD_MS, to suppress sub-2s flaps.
  const [showStrip, setShowStrip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isReconnecting) {
      // Schedule the show only if disconnected stays past threshold.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setShowStrip(true);
      }, THRESHOLD_MS);
    } else {
      // Reconnected — clear any pending show, hide strip if visible.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setShowStrip(false);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isReconnecting]);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={`overflow-hidden transition-all duration-150 ease-out motion-reduce:transition-none ${
        showStrip
          ? "max-h-8 opacity-100"
          : "max-h-0 opacity-0 pointer-events-none"
      }`}
    >
      <div className="flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-ink-500 bg-ink-100 border-b border-neutral-200">
        <span
          className="w-1.5 h-1.5 rounded-full bg-ink-400 animate-pulse"
          aria-hidden="true"
        />
        <span>Reconnecting…</span>
      </div>
    </div>
  );
}
