"use client";

import { useEffect, useState } from "react";

// Stage 2.C Commit 8 — TC-002 retry-while-offline guard.
//
// Subscribes to window.online / window.offline events and exposes the current
// state as a boolean. Defaults to `true` on first render (matches navigator's
// own optimistic default + avoids hydration mismatch — server can't know).
// Useful for offline-aware UI like "Retry" affordances that need to suppress
// dispatch while the device is clearly disconnected.
//
// Reliability caveat: navigator.onLine is "good enough for clearly-offline"
// but unreliable for "actually-reachable" — captive portals, DNS failures,
// API outages all read as online. For Commit 8's Retry guard this is
// sufficient; the dispatch itself is the ground truth.

export function useNavigatorOnline(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Read once on mount to catch the case where the user opened the tab
    // already offline.
    setIsOnline(navigator.onLine);

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return isOnline;
}
