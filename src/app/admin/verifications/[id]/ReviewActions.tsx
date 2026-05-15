"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui";
import {
  approveVerificationAction,
  rejectVerificationAction,
} from "@/app/(auth)/actions";

interface Props {
  verificationId: string;
}

const initialReject = { errors: {} };

export function ReviewActions({ verificationId }: Props) {
  const [mode, setMode] = useState<"idle" | "rejecting">("idle");
  const [state, formAction] = useFormState(
    rejectVerificationAction,
    initialReject
  );
  const approveBound = approveVerificationAction.bind(null, verificationId);

  if (mode === "rejecting") {
    return (
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="verificationId" value={verificationId} />
        {state?.errors?._form && (
          <div
            role="alert"
            className="bg-danger-bg border border-danger/30 text-danger-text text-sm px-3 py-2.5 rounded-lg"
          >
            {state.errors._form}
          </div>
        )}
        <div>
          <label
            htmlFor="rejectionReason"
            className="block text-sm font-medium text-ink mb-1.5"
          >
            Rejection reason (visible to seller)
          </label>
          <textarea
            id="rejectionReason"
            name="rejectionReason"
            required
            rows={4}
            minLength={10}
            maxLength={500}
            className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400"
            placeholder="Be specific. E.g., 'The selfie doesn't clearly show your face. Please resubmit with better lighting.'"
          />
          {state?.errors?.rejectionReason && (
            <p className="text-xs text-danger mt-1.5">
              {state.errors.rejectionReason}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <RejectSubmit />
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMode("idle")}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex gap-3">
      <form action={approveBound}>
        <Button type="submit" variant="primary" size="lg">
          Approve
        </Button>
      </form>
      <Button
        type="button"
        variant="ghost"
        size="lg"
        onClick={() => setMode("rejecting")}
      >
        Reject
      </Button>
    </div>
  );
}

function RejectSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? "Submitting…" : "Confirm rejection"}
    </Button>
  );
}
