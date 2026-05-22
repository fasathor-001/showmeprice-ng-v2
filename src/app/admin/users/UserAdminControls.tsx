"use client";

// Inline grant/revoke control for one user row (D-105 Commit 5). Mirrors the
// ReviewActions inline-expand pattern (no Modal primitive exists): a button
// swaps in place for a reason field + Confirm/Cancel. The Commit-4 actions
// take direct args (not FormData), so they're called directly inside
// useTransition rather than via useFormState. router.refresh() on success
// re-renders the server list with the new role. Self-revoke and last-admin
// revocation are disabled here (defense in depth — the SQL functions also
// guard), with explanatory helper text.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { grantAdminAction, revokeAdminAction } from "./actions";

interface Props {
  userId: string;
  displayName: string;
  isAdmin: boolean;
  revokeDisabledReason: "self" | "last_admin" | null;
}

export function UserAdminControls({
  userId,
  displayName,
  isAdmin,
  revokeDisabledReason,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Revoke blocked (self or last admin) — show a disabled button + reason.
  if (isAdmin && revokeDisabledReason) {
    return (
      <div className="text-right">
        <Button type="button" variant="ghost" size="sm" disabled>
          Revoke admin
        </Button>
        <p className="text-xs text-ink-400 mt-1 max-w-[12rem]">
          {revokeDisabledReason === "self"
            ? "Cannot revoke your own admin role"
            : "Cannot revoke the last admin — grant another admin first"}
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant={isAdmin ? "ghost" : "primary"}
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {isAdmin ? "Revoke admin" : "Grant admin"}
      </Button>
    );
  }

  const verb = isAdmin ? "Revoke" : "Grant";
  const canSubmit = reason.trim().length >= 5 && !isPending;

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const res = isAdmin
        ? await revokeAdminAction(userId, reason)
        : await grantAdminAction(userId, reason);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 w-full max-w-sm">
      <p className="text-sm text-ink">
        {isAdmin
          ? `Revoke admin access from ${displayName}?`
          : `Grant admin access to ${displayName}?`}
      </p>
      {error && (
        <div
          role="alert"
          className="bg-danger-bg border border-danger/30 text-danger-text text-sm px-3 py-2.5 rounded-lg"
        >
          {error}
        </div>
      )}
      <div>
        <label
          htmlFor={`admin-reason-${userId}`}
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Reason (recorded in the audit log)
        </label>
        <textarea
          id={`admin-reason-${userId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          rows={3}
          minLength={5}
          maxLength={500}
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400"
          placeholder={
            isAdmin
              ? "Why is this admin being revoked?"
              : "Why is this user being granted admin?"
          }
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant={isAdmin ? "danger" : "primary"}
          disabled={!canSubmit}
          onClick={onConfirm}
        >
          {isPending
            ? isAdmin
              ? "Revoking…"
              : "Granting…"
            : `Confirm ${verb.toLowerCase()}`}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
