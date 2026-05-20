"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@/components/ui";
import { updateBusinessAction } from "@/app/(auth)/actions";

interface Business {
  business_name: string;
  description: string | null;
  state_id: string | null;
  city_area: string | null;
}

interface State {
  id: string;
  name: string;
}

interface Props {
  business: Business;
  states: State[];
}

const initial = { errors: {} };

export function ManageBusinessForm({ business, states }: Props) {
  const [state, formAction] = useFormState(updateBusinessAction, initial);

  // Success surfaces as ?toast=business-updated on /sell after the action's
  // redirect (Phase C.5.6.0 — revalidatePath fails on Cloudflare edge so we
  // can't keep the previous "return success state" pattern). This form only
  // renders inline error states.
  return (
    <form action={formAction} noValidate className="space-y-4">
      {state?.errors?._form && (
        <div
          role="alert"
          className="bg-danger-bg border border-danger/30 text-danger-text text-sm px-3 py-2.5 rounded-lg"
        >
          {state?.errors._form}
        </div>
      )}

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
          defaultValue={business.business_name}
          required
          error={state?.errors?.businessName}
        />
      </div>

      <div>
        <label
          htmlFor="businessDescription"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          What do you sell?
        </label>
        <textarea
          id="businessDescription"
          name="businessDescription"
          defaultValue={business.description ?? ""}
          rows={4}
          maxLength={500}
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink placeholder:text-neutral-400 px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400 focus:ring-offset-1"
          placeholder="Briefly describe your business — what you sell, where you're based, anything that helps buyers trust you."
        />
        {state?.errors?.businessDescription && (
          <p className="text-xs text-danger mt-1.5">
            {state?.errors.businessDescription}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="stateId" className="block text-sm font-medium text-ink mb-1.5">
          Primary state
        </label>
        <select
          id="stateId"
          name="stateId"
          required
          defaultValue={business.state_id ?? ""}
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400 focus:ring-offset-1"
        >
          <option value="" disabled>
            Choose a state
          </option>
          {states.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {state?.errors?.stateId && (
          <p className="text-xs text-danger mt-1.5">{state?.errors.stateId}</p>
        )}
      </div>

      {/* Sprint 3 / Gap D.6: business operating location (optional).
          Legacy businesses (pre-D.1) have NULL city_area → "" → empty input. */}
      <div>
        <label htmlFor="cityArea" className="block text-sm font-medium text-ink mb-1.5">
          City / Area <span className="text-ink-600 font-normal">(optional)</span>
        </label>
        <Input
          id="cityArea"
          name="cityArea"
          type="text"
          defaultValue={business.city_area ?? ""}
          error={state?.errors?.cityArea}
          placeholder="e.g. Ikeja, Computer Village"
        />
        <p className="text-xs text-ink-600 mt-1.5">Where your business operates from</p>
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}
