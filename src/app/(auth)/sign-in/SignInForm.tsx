"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@/components/ui";
import { signInAction, type ActionResult } from "../actions";

const initial: ActionResult = {};

export function SignInForm() {
  const [state, formAction] = useFormState(signInAction, initial);

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

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={state.errors?.password}
          placeholder="Your password"
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
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}
