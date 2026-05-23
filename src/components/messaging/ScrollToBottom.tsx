"use client";

import { useEffect, useRef } from "react";

// Commit 3 — pure scroll-to-bottom marker for the message thread.
// The rest of the thread is a Server Component; this is the only client-side
// JS in the route (until Commit 5 layers realtime on top).
//
// Render this as the last child of the message list. On mount we scroll the
// marker into view, which puts the bottom of the thread at the bottom of the
// scrollable viewport. `behavior: 'auto'` (not 'smooth') so the scroll happens
// instantly — feels native, no jarring animation on page load.
export function ScrollToBottom() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }, []);
  return <div ref={ref} aria-hidden="true" />;
}
