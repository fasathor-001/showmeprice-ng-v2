"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui";
import { signOutAction } from "@/app/(auth)/actions";
import { useUnreadMessagesCount } from "./UnreadMessagesProvider";

// Stage 2.B Commit 6 — K-040 closeout: avatar gets a small red presence dot
// when the user has unread messages. Three surfaces now signal unread:
//   1. Header chat icon → red count badge (precise count)
//   2. UserMenu avatar trigger → small red dot (presence signal — picks up
//      users glancing at their avatar instead of the icon)
//   3. UserMenu dropdown "Messages" row → inline red count badge (visible
//      after dropdown opens)
//
// All three read the same realtime count from UnreadMessagesProvider so
// they're always in sync (no stale-state divergence between surfaces).

interface UserMenuProps {
  displayName: string;
  email: string;
  isAdmin?: boolean;
}

export function UserMenu({ displayName, email, isAdmin = false }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const unreadMessagesCount = useUnreadMessagesCount();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const initials =
    displayName
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  const hasUnread = unreadMessagesCount > 0;
  const unreadDisplay =
    unreadMessagesCount > 99 ? "99+" : String(unreadMessagesCount);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center gap-2 rounded-full p-0.5 hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          hasUnread
            ? `Account menu, ${unreadMessagesCount} unread messages`
            : "Account menu"
        }
      >
        <Avatar initials={initials} alt={displayName} size="sm" />
        {hasUnread && (
          // K-040 avatar presence dot. Same red as the icon's count badge
          // (bg-red-500) for visual consistency. Smaller than the icon
          // badge (no number inside) — distinct visual hierarchy: icon
          // shows count, avatar shows presence only.
          <span
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white"
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-xl border border-neutral-200 bg-white shadow-cardHover py-1 z-50"
        >
          <div className="px-4 py-2.5 border-b border-neutral-200">
            <div className="text-sm font-medium text-ink truncate">{displayName}</div>
            <div className="text-xs text-ink-600 truncate">{email}</div>
          </div>
          <Link
            href="/dashboard"
            className="block px-4 py-3 text-sm text-ink-600 hover:bg-neutral-50 hover:text-ink"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Dashboard
          </Link>
          {/* Inline red unread badge next to "Messages" when count > 0.
              Reads from the same realtime-updating context as the header
              icon — both surfaces stay in sync (Commit 6 K-040 closeout). */}
          <Link
            href="/messages"
            className="flex items-center justify-between px-4 py-3 text-sm text-ink-600 hover:bg-neutral-50 hover:text-ink"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span>Messages</span>
            {hasUnread && (
              <span
                className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none"
                aria-label={`${unreadMessagesCount} unread`}
              >
                {unreadDisplay}
              </span>
            )}
          </Link>
          <Link
            href="/settings"
            className="block px-4 py-3 text-sm text-ink-600 hover:bg-neutral-50 hover:text-ink"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="block px-4 py-3 text-sm text-ink-600 hover:bg-neutral-50 hover:text-ink"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              Admin
            </Link>
          )}
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full text-left px-4 py-3 text-sm text-ink-600 hover:bg-neutral-50 hover:text-ink"
              role="menuitem"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
