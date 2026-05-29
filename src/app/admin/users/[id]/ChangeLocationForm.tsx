"use client";

// E.2.16.0 Step 3 — admin form for changing a user's location (state_id).
// Submits to changeUserLocationAction; on success redirects with
// ?toast=location-changed or location-unchanged.
//
// State dropdown is populated server-side and passed as `states`.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import {
  changeUserLocationAction,
  type AdminProfileChangeResult,
} from "../actions";

interface StateOption {
  id: string;
  name: string;
}

interface Props {
  targetUserId: string;
  currentStateId: string | null;
  states: StateOption[];
}

export function ChangeLocationForm({
  targetUserId,
  currentStateId,
  states,
}: Props) {
  const router = useRouter();
  const [stateId, setStateId] = useState<string>(currentStateId ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit =
    stateId.length > 0 && reason.trim().length >= 5 && !isPending;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.append("new_state_id", stateId);
    formData.append("reason", reason);
    startTransition(async () => {
      const res: AdminProfileChangeResult = await changeUserLocationAction(
        targetUserId,
        formData,
      );
      if (res.error) {
        setError(res.error);
        return;
      }
      const toastKey = res.unchanged
        ? "location-unchanged"
        : "location-changed";
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
          htmlFor={`new-state-${targetUserId}`}
          className="block text-sm font-medium text-ink mb-1.5"
        >
          New state
        </label>
        <select
          id={`new-state-${targetUserId}`}
          value={stateId}
          onChange={(e) => setStateId(e.target.value)}
          required
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400"
        >
          <option value="">Select a state…</option>
          {states.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor={`location-reason-${targetUserId}`}
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Reason (recorded in the audit log)
        </label>
        <textarea
          id={`location-reason-${targetUserId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          rows={3}
          minLength={5}
          maxLength={500}
          placeholder="e.g. Support ticket #1234 — user moved"
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400"
        />
      </div>

      <Button type="submit" variant="primary" disabled={!canSubmit}>
        {isPending ? "Changing…" : "Change location"}
      </Button>
    </form>
  );
}
