"use client";

// Row-level revoke control for an admin (D-107, extracted from the former
// dual-purpose UserAdminControls — the staff page lists only admins, so grant
// moved to GrantAdminPanel). Inline-expand pattern (no Modal primitive): the
// button swaps in place for a reason field + Confirm/Cancel. revokeAdminAction
// takes direct args, so it's called inside useTransition; router.refresh() on
// success re-renders the server list. Self-revoke and last-admin revocation are
// disabled here with helper text (defense in depth — the SQL function guards too).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { revokeAdminAction } from "./actions";

interface Props {
  userId: string;
  displayName: string;
  revokeDisabledReason: "self" | "last_admin" | null;
}

export function RevokeAdminControl({
  userId,
  displayName,
  revokeDisabledReason,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Revoke blocked (self or last admin) — disabled button + explanatory text.
  if (revokeDisabledReason) {
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
        variant="ghost"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Revoke admin
      </Button>
    );
  }

  const canSubmit = reason.trim().length >= 5 && !isPending;

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const res = await revokeAdminAction(userId, reason);
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
        Revoke admin access from {displayName}?
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
          htmlFor={`revoke-reason-${userId}`}
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Reason (recorded in the audit log)
        </label>
        <textarea
          id={`revoke-reason-${userId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          rows={3}
          minLength={5}
          maxLength={500}
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400"
          placeholder="Why is this admin being revoked?"
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="danger"
          disabled={!canSubmit}
          onClick={onConfirm}
        >
          {isPending ? "Revoking…" : "Confirm revoke"}
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
