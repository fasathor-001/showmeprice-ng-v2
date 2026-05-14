"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@/components/ui";
import { updatePasswordAction, type ActionResult } from "../actions";

const initial: ActionResult = {};

export function ResetPasswordForm() {
  const [state, formAction] = useFormState(updatePasswordAction, initial);

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
        <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
          New password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          error={state.errors?.password}
          placeholder="At least 8 characters"
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink mb-1.5">
          Confirm new password
        </label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          placeholder="Re-enter your new password"
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
      {pending ? "Updating password…" : "Update password"}
    </Button>
  );
}
