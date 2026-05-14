"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@/components/ui";
import { signUpAction, type ActionResult } from "../actions";

const initial: ActionResult = {};

export function SignUpForm() {
  const [state, formAction] = useFormState(signUpAction, initial);

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
        <label htmlFor="displayName" className="block text-sm font-medium text-ink mb-1.5">
          Your name
        </label>
        <Input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          required
          error={state.errors?.displayName}
          placeholder="Amaka Okeke"
        />
      </div>

      <div>
        <label htmlFor="whatsappNumber" className="block text-sm font-medium text-ink mb-1.5">
          WhatsApp number
        </label>
        <Input
          id="whatsappNumber"
          name="whatsappNumber"
          type="tel"
          autoComplete="tel"
          inputMode="numeric"
          required
          error={state.errors?.whatsappNumber}
          placeholder="0801 234 5678"
        />
        <p className="mt-1.5 text-xs text-ink-600">
          Sellers will message you on this number when you contact them.
        </p>
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
          Password
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

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending}>
      {pending ? "Creating account…" : "Create account"}
    </Button>
  );
}
