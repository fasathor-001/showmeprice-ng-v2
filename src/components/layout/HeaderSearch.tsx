"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Global search affordance in the header.
 *
 * Desktop (>=md): inline search form that's always visible.
 * Mobile (<md): magnifying-glass icon button that opens a top-anchored
 * overlay containing the same form. ESC and backdrop click close the
 * overlay; submit navigates away naturally.
 *
 * Form posts to /marketplace?q=<value> — same contract as the rest of
 * the app's global search (Phase D.5).
 */
export function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // Focus the input the moment the overlay mounts.
    inputRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);

    // Body scroll lock while overlay is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      {/* Desktop inline form */}
      <form
        action="/marketplace"
        method="get"
        className="hidden md:flex flex-1 max-w-md"
        role="search"
      >
        <label className="flex flex-1 items-stretch bg-neutral-50 border border-neutral-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-teal-400 focus-within:border-teal-600 focus-within:bg-white">
          <span className="pl-3 self-center text-neutral-400">
            <SearchIcon />
          </span>
          <span className="sr-only">Search marketplace</span>
          <input
            type="search"
            name="q"
            placeholder="Search verified sellers…"
            className="flex-1 bg-transparent border-0 outline-none text-sm text-ink placeholder:text-neutral-400 px-2.5 py-1.5 min-w-0"
          />
        </label>
      </form>

      {/* Mobile icon button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open search"
        aria-expanded={open}
        className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg text-ink-600 hover:bg-neutral-100 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
      >
        <SearchIcon />
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          className="fixed inset-0 z-50 bg-black/40 md:hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-white shadow-lg p-3 sm:p-4">
            <form
              action="/marketplace"
              method="get"
              role="search"
              className="flex items-stretch gap-2"
            >
              <label className="flex flex-1 items-stretch bg-neutral-50 border border-neutral-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-teal-400 focus-within:border-teal-600 focus-within:bg-white">
                <span className="pl-3 self-center text-neutral-400">
                  <SearchIcon />
                </span>
                <span className="sr-only">Search marketplace</span>
                <input
                  ref={inputRef}
                  type="search"
                  name="q"
                  placeholder="Search verified sellers…"
                  className="flex-1 bg-transparent border-0 outline-none text-base text-ink placeholder:text-neutral-400 px-2.5 py-2.5 min-w-0"
                />
              </label>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close search"
                className="inline-flex items-center justify-center px-3 rounded-lg text-ink-600 hover:bg-neutral-100 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              >
                <CloseIcon />
              </button>
            </form>
            <p className="text-xs text-ink-400 mt-2">
              Press Esc or tap outside to close
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
