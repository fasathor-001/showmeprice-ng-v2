"use client";

// E.2.16.0 Step 3 — admin form for changing a user's phone number.
// Submits to changeUserPhoneAction; on success redirects back to the
// same user-detail URL with ?toast=phone-changed (or phone-unchanged
// for the idempotent no-op).
//
// Shape mirrors GrantAdminPanel / RevokeAdminControl: useTransition +
// inline error surface + router.push for the toast pattern.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import {
  changeUserPhoneAction,
  type AdminProfileChangeResult,
} from "../actions";
import { formatNigerianPhone } from "@/lib/auth";

interface Props {
  targetUserId: string;
  currentPhone: string | null;
}

export function ChangePhoneForm({ targetUserId, currentPhone }: Props) {
  const router = useRouter();
  const [newPhone, setNewPhone] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit =
    newPhone.trim().length > 0 && reason.trim().length >= 5 && !isPending;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.append("new_phone", newPhone);
    formData.append("reason", reason);
    startTransition(async () => {
      const res: AdminProfileChangeResult = await changeUserPhoneAction(
        targetUserId,
        formData,
      );
      if (res.error) {
        setError(res.error);
        return;
      }
      const toastKey = res.unchanged ? "phone-unchanged" : "phone-changed";
      router.push(`/admin/users/${targetUserId}?toast=${toastKey}`);
      router.refresh();
    });
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
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
          htmlFor={`new-phone-${targetUserId}`}
          className="block text-sm font-medium text-ink mb-1.5"
        >
          New phone number
        </label>
        <input
          id={`new-phone-${targetUserId}`}
          type="tel"
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
          required
          autoComplete="off"
          placeholder="08012345678"
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400 tabular-nums"
        />
        <p className="text-xs text-ink-400 mt-1">
          Nigerian mobile, any common format (080…, +234…). We&apos;ll
          normalize it.
        </p>
        {currentPhone && (
          <p className="text-xs text-ink-400 mt-1 tabular-nums">
            Current: {formatNigerianPhone(currentPhone)}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor={`phone-reason-${targetUserId}`}
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Reason (recorded in the audit log)
        </label>
        <textarea
          id={`phone-reason-${targetUserId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          rows={3}
          minLength={5}
          maxLength={500}
          placeholder="e.g. Support ticket #1234 — user requested update"
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400"
        />
      </div>

      <Button type="submit" variant="primary" disabled={!canSubmit}>
        {isPending ? "Changing…" : "Change phone"}
      </Button>
    </form>
  );
}
