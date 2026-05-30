"use client";

import { useEffect } from "react";

// Feature I — Phase 1. Registers the service worker at `/sw.js` on
// mount. Renders nothing. Mounted once in the root layout's body so
// it runs on every page exactly once per session.
//
// Browser support check guards against SSR surprises and older
// browsers (Firefox < 44, IE, etc.) where `navigator.serviceWorker`
// is undefined. Failures are logged but never thrown — a missing SW
// just means no offline support, not a broken app.

export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("[sw] registered, scope:", registration.scope);
      })
      .catch((error) => {
        console.error("[sw] registration failed:", error);
      });
  }, []);

  return null;
}
