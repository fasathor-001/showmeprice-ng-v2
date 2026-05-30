"use client";

// E.2.20.0 / Feature J.3 — admin form for suspending or unsuspending a
// user account. Submits to suspendUserAction / unsuspendUserAction
// (both shipped in J.2). On success redirects back to the same
// user-detail URL with ?toast=account-suspended or account-unsuspended.
//
// Shape mirrors ChangePhoneForm / ChangeLocationForm: useTransition +
// inline error surface + router.push for the toast pattern.
//
// Visibility states:
//   1. Self-target (the signed-in admin viewing their own profile):
//      no form. A quiet notice mirrors the RPC's self-refusal at 42501
//      (admin_suspend_user / admin_unsuspend_user both raise on
//      p_granter = p_target). Hiding the UI prevents the click that
//      would always fail anyway.
//   2. Target currently active (is_disabled=false): suspend form.
//      Button is danger-styled because suspension is the higher-impact
//      action — it cascades businesses.is_disabled=true and hides the
//      user's listings across all 6 public browse surfaces (D-146).
//   3. Target currently suspended (is_disabled=true): unsuspend form.
//      Button is primary-styled. Per locked decision #6, this only
//      reverses profiles.is_disabled — owned businesses stay disabled
//      and must be re-enabled by the admin separately. The toast on
//      success explicitly says so.
//
// Reason: required, 5..500 chars. Matches the existing phone/location
// pattern and the RPC's own 22023 validation. Native HTML attributes
// enforce at the browser layer; the client also guards canSubmit before
// dispatch; the action validates again; the RPC re-validates as the
// real gate.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import {
  suspendUserAction,
  unsuspendUserAction,
  type AdminSuspensionResult,
} from "../actions";

interface Props {
  targetUserId: string;
  targetDisplayName: string;
  isTargetSuspended: boolean;
  isSelfTarget: boolean;
}

export function SuspendUserPanel({
  targetUserId,
  targetDisplayName,
  isTargetSuspended,
  isSelfTarget,
}: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Self-target: no form. Mirrors RPC self-refusal at 42501.
  if (isSelfTarget) {
    return (
      <p className="text-sm text-ink-600">
        You can&apos;t suspend or unsuspend your own account. Another admin
        must perform this action.
      </p>
    );
  }

  const trimmedLength = reason.trim().length;
  const canSubmit =
    trimmedLength >= 5 && trimmedLength <= 500 && !isPending;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const action = isTargetSuspended ? unsuspendUserAction : suspendUserAction;
    startTransition(async () => {
      const res: AdminSuspensionResult = await action(targetUserId, reason);
      if (res.error) {
        setError(res.error);
        return;
      }
      const toastKey =
        res.action === "account_unsuspended"
          ? "account-unsuspended"
          : "account-suspended";
      router.push(`/admin/users/${targetUserId}?toast=${toastKey}`);
      router.refresh();
    });
  };

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
          htmlFor={`suspend-reason-${targetUserId}`}
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Reason (recorded in the audit log)
        </label>
        <textarea
          id={`suspend-reason-${targetUserId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          rows={3}
          minLength={5}
          maxLength={500}
          placeholder={
            isTargetSuspended
              ? "e.g. Appeal resolved — restoring account"
              : "e.g. Repeated policy violations — see ticket #1234"
          }
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400"
        />
        <p className="text-xs text-ink-400 mt-1">
          {trimmedLength}/500 characters. Minimum 5.
        </p>
      </div>

      <Button
        type="submit"
        variant={isTargetSuspended ? "primary" : "danger"}
        disabled={!canSubmit}
      >
        {isPending
          ? isTargetSuspended
            ? "Unsuspending…"
            : "Suspending…"
          : isTargetSuspended
            ? `Unsuspend ${targetDisplayName}`
            : `Suspend ${targetDisplayName}`}
      </Button>
    </form>
  );
}
