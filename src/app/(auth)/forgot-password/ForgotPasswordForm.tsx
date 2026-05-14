"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@/components/ui";
import { requestPasswordResetAction, type ActionResult } from "../actions";

const initial: ActionResult = {};

export function ForgotPasswordForm() {
  const [state, formAction] = useFormState(requestPasswordResetAction, initial);

  if (state.success) {
    return (
      <div className="bg-verified-bg border border-verified/30 text-verified-text text-sm px-4 py-3 rounded-lg text-center">
        If an account exists with that email, we&apos;ve sent a reset link. Check your inbox.
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.errors?._form && (
        <div
          role="alert"
          className="bg-danger-bg border border-danger/30 text-danger-text text-sm px-3 py-2.5 rounded-lg"
        >
          {state.errors._form}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink mb-1.5">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={state.errors?.email}
          placeholder="you@example.com"
        />
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending}>
      {pending ? "Sending…" : "Send reset link"}
    </Button>
  );
}
