"use client";

import { useEffect, useState } from "react";
import {
  formatConversationTime,
  formatLastActive,
  formatThreadDateDivider,
} from "./time";

// Stage 2.B Commit 5.5 — client-only time formatting hook.
//
// Why: every time-formatting call site (MessageBubble HH:mm, ConversationRow
// formatConversationTime/formatLastActive, MessageThread DateDivider) used
// either `now = new Date()` as a default function parameter OR `t.getHours()`
// on a local-timezone basis. Both diverge between Cloudflare Edge SSR (UTC,
// server's clock at render time) and the user's browser (their timezone,
// their clock at hydration time). Result: server-rendered text ≠ client-
// rendered text → React #425 text-content-mismatch → cascading #418/#423
// (root fall back to client-only rendering) → optimistic UI dispatches and
// realtime subscriptions broken intermittently.
//
// Fix: this hook returns `""` on first render (server + first client paint).
// useEffect runs ONLY on client after hydration, computes the formatted
// string with the client's clock + timezone, calls setText. The server-
// rendered HTML matches the client's first paint (both empty), so React's
// hydration check passes. The formatted text appears as a normal post-mount
// state update — no hydration warning.
//
// Trade-off: brief blank (first paint shows empty; ~1 frame later useEffect
// fires and text appears). For HH:mm timestamps under chat bubbles this is
// imperceptible. Acceptable under D-121 — invisible flicker is a much smaller
// quality cost than a broken realtime layer.

type Mode = "hhmm" | "conversation" | "lastActive" | "threadDivider";

export function useClientTime(
  iso: string | null | undefined,
  mode: Mode,
): string {
  const [text, setText] = useState<string>("");

  useEffect(() => {
    if (!iso) {
      setText("");
      return;
    }
    const now = new Date();
    if (mode === "hhmm") {
      const t = new Date(iso);
      if (Number.isNaN(t.getTime())) {
        setText("");
        return;
      }
      const hh = String(t.getHours()).padStart(2, "0");
      const mm = String(t.getMinutes()).padStart(2, "0");
      setText(`${hh}:${mm}`);
    } else if (mode === "conversation") {
      setText(formatConversationTime(iso, now));
    } else if (mode === "lastActive") {
      setText(formatLastActive(iso, now));
    } else if (mode === "threadDivider") {
      setText(formatThreadDateDivider(iso, now));
    }
  }, [iso, mode]);

  return text;
}
