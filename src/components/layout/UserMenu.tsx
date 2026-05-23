"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui";
import { signOutAction } from "@/app/(auth)/actions";

interface UserMenuProps {
  displayName: string;
  email: string;
  isAdmin?: boolean;
  /** Total unread messages — drives the inline red badge on the Messages row. */
  unreadMessagesCount?: number;
}

export function UserMenu({
  displayName,
  email,
  isAdmin = false,
  unreadMessagesCount = 0,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const unreadDisplay =
    unreadMessagesCount > 99 ? "99+" : String(unreadMessagesCount);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full p-0.5 hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <Avatar initials={initials} alt={displayName} size="sm" />
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
          {/* Stage 2.B Commit 5.1 — inline red unread badge next to "Messages"
              when count > 0. Server-rendered count (refreshes on navigation);
              the realtime-live indicator is the header Messages icon badge
              above. UserMenu re-syncs on next route change. */}
          <Link
            href="/messages"
            className="flex items-center justify-between px-4 py-3 text-sm text-ink-600 hover:bg-neutral-50 hover:text-ink"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span>Messages</span>
            {unreadMessagesCount > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none"
                aria-label={`${unreadMessagesCount} unread`}
              >
                {unreadDisplay}
              </span>
            )}
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
