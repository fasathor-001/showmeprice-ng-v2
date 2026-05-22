"use client";

// Header-level search-and-grant panel (D-107). Replaces the former row-level
// grant button: the staff page lists only admins, so promoting a new admin
// means searching for a non-admin user first. Inline-expand (no Modal
// primitive): the "Grant admin role" button toggles this panel.
//
// Flow: debounced live search (300ms, min 3 chars) -> pick a result -> reason
// field -> confirm. On success, the panel collapses + clears and the server
// list refreshes. Search excludes existing admins and disabled accounts
// (server-side); grantAdminAction adds the same disabled guard as defense.

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import {
  searchUsersAction,
  grantAdminAction,
  type AdminSearchUser,
} from "./actions";

export function GrantAdminPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminSearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<AdminSearchUser | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Debounced live search (300ms, min 3 chars). Paused once a user is selected.
  useEffect(() => {
    if (!open || selected) return;
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await searchUsersAction(q);
      if (res.error) {
        setError(res.error);
        setResults([]);
      } else {
        setResults(res.users ?? []);
      }
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, selected, open]);

  function reset() {
    setOpen(false);
    setQuery("");
    setResults([]);
    setSelected(null);
    setReason("");
    setError(null);
    setSearching(false);
  }

  function onConfirm() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await grantAdminAction(selected.id, reason);
      if (res.error) {
        setError(res.error);
        return;
      }
      // Auto-collapse + clear, THEN refresh so the new admin appears in the list.
      reset();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Grant admin role
      </Button>
    );
  }

  const canSubmit = !!selected && reason.trim().length >= 5 && !isPending;

  return (
    <div className="w-full max-w-sm space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink">Grant admin role</h2>
        <button
          type="button"
          onClick={reset}
          disabled={isPending}
          className="text-sm text-ink-600 hover:text-ink disabled:opacity-50"
        >
          Close
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-danger-bg border border-danger/30 text-danger-text text-sm px-3 py-2.5 rounded-lg"
        >
          {error}
        </div>
      )}

      {!selected ? (
        <>
          <div>
            <label
              htmlFor="grant-search"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              Find a user
            </label>
            <input
              id="grant-search"
              type="text"
              value={query}
              onChange={(e) => {
                setError(null);
                setQuery(e.target.value);
              }}
              placeholder="Search by email or name (min 3 chars)"
              className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400"
            />
          </div>
          {searching && <p className="text-xs text-ink-400">Searching…</p>}
          {!searching &&
            query.trim().length >= 3 &&
            results.length === 0 && (
              <p className="text-xs text-ink-400">
                No matching users (existing admins and disabled accounts are
                excluded).
              </p>
            )}
          {results.length > 0 && (
            <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
              {results.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(u);
                      setError(null);
                    }}
                    className="block w-full text-left px-3 py-2 hover:bg-neutral-50 focus:outline-none focus-visible:bg-neutral-50"
                  >
                    <span className="block text-sm text-ink truncate">
                      {u.displayName}
                    </span>
                    <span className="block text-xs text-ink-600 truncate">
                      {u.email}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-ink">
            Grant admin access to{" "}
            <span className="font-medium">{selected.displayName}</span> (
            {selected.email})?
          </p>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setReason("");
            }}
            className="text-xs text-ink-600 hover:text-ink underline"
          >
            Choose a different user
          </button>
          <div>
            <label
              htmlFor="grant-reason"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              Reason (recorded in the audit log)
            </label>
            <textarea
              id="grant-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              minLength={5}
              maxLength={500}
              className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400"
              placeholder="Why is this user being granted admin?"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={!canSubmit}
              onClick={onConfirm}
            >
              {isPending ? "Granting…" : "Confirm grant"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => {
                setSelected(null);
                setReason("");
              }}
            >
              Back
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
