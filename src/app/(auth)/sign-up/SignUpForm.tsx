"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@/components/ui";
import { signUpAction, type ActionResult } from "../actions";

interface State {
  id: string;
  name: string;
}

interface Props {
  states: State[];
}

const initial: ActionResult = {};

export function SignUpForm({ states }: Props) {
  const [state, formAction] = useFormState(signUpAction, initial);
  const [accountType, setAccountType] = useState<"buyer" | "seller">("buyer");

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
        <label className="block text-sm font-medium text-ink mb-2">
          I&apos;m joining as:
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setAccountType("buyer")}
            className={`px-4 py-3 rounded-lg border text-sm font-medium transition text-left ${
              accountType === "buyer"
                ? "bg-teal-50 border-teal-600 text-teal-700"
                : "bg-white border-neutral-300 text-ink-600 hover:border-neutral-400"
            }`}
            aria-pressed={accountType === "buyer"}
          >
            Buyer
            <span className="block text-xs font-normal mt-0.5 text-ink-400">
              Browse and message sellers
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAccountType("seller")}
            className={`px-4 py-3 rounded-lg border text-sm font-medium transition text-left ${
              accountType === "seller"
                ? "bg-teal-50 border-teal-600 text-teal-700"
                : "bg-white border-neutral-300 text-ink-600 hover:border-neutral-400"
            }`}
            aria-pressed={accountType === "seller"}
          >
            Seller
            <span className="block text-xs font-normal mt-0.5 text-ink-400">
              List products and reach buyers
            </span>
          </button>
        </div>
        <input type="hidden" name="userType" value={accountType} />
      </div>

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
        {/*
          Form field name + id are `phone` (renamed from `whatsappNumber` in
          Phase E.1.0 to align with profiles.phone). UI label remains
          "WhatsApp number" since the column holds the user's WhatsApp
          number in NG context (D-055).
        */}
        <label
          htmlFor="phone"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          WhatsApp number
        </label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="numeric"
          required
          error={state.errors?.phone}
          placeholder="0801 234 5678"
        />
        <p className="mt-1.5 text-xs text-ink-600">
          {accountType === "seller"
            ? "Buyers will message you on this number."
            : "Sellers will message you on this number when you contact them."}
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

      {accountType === "seller" && (
        <fieldset className="space-y-4 pt-2 border-t border-neutral-200">
          <legend className="sr-only">Business info</legend>
          <p className="text-xs text-ink-600 -mb-2">Your business details:</p>
          <div>
            <label
              htmlFor="businessName"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              Business name
            </label>
            <Input
              id="businessName"
              name="businessName"
              type="text"
              required
              error={state.errors?.businessName}
              placeholder="e.g. Amaka's Fashion Store"
            />
          </div>
          <div>
            <label
              htmlFor="businessStateId"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              State of operation
            </label>
            <select
              id="businessStateId"
              name="businessStateId"
              required
              defaultValue=""
              className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400"
            >
              <option value="" disabled>
                Choose state
              </option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {state.errors?.businessStateId && (
              <p className="text-xs text-danger mt-1.5">{state.errors.businessStateId}</p>
            )}
          </div>
        </fieldset>
      )}

      <SubmitButton accountType={accountType} />
    </form>
  );
}

function SubmitButton({ accountType }: { accountType: "buyer" | "seller" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending}>
      {pending ? "Creating account…" : `Sign up as ${accountType}`}
    </Button>
  );
}
