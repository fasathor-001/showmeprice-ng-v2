"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@/components/ui";
import type { ListingValidationErrors } from "@/lib/listings";

interface Category {
  id: string;
  name: string;
}
interface State {
  id: string;
  name: string;
}

interface ListingFormDefaults {
  title?: string;
  description?: string;
  priceInput?: string;
  categoryId?: string;
  stateId?: string;
  negotiable?: boolean;
  imageUrls?: string[];
}

interface Props {
  // Bound server action — either createListingAction or updateListingAction.bind(null, id)
  action: (
    prev: { errors?: ListingValidationErrors } | null,
    formData: FormData
  ) => Promise<{ errors?: ListingValidationErrors }>;
  categories: Category[];
  states: State[];
  defaults?: ListingFormDefaults;
  submitLabel: string;
  pendingLabel: string;
}

export function ListingForm({
  action,
  categories,
  states,
  defaults,
  submitLabel,
  pendingLabel,
}: Props) {
  const [state, formAction] = useFormState(action, { errors: {} });
  const [imageUrls, setImageUrls] = useState<string[]>(
    defaults?.imageUrls && defaults.imageUrls.length > 0
      ? defaults.imageUrls
      : [""]
  );

  const updateUrl = (idx: number, value: string) => {
    setImageUrls((urls) => urls.map((u, i) => (i === idx ? value : u)));
  };
  const addUrl = () => setImageUrls((urls) => [...urls, ""]);
  const removeUrl = (idx: number) => {
    setImageUrls((urls) =>
      urls.length > 1 ? urls.filter((_, i) => i !== idx) : urls
    );
  };

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.errors?._form && (
        <div
          role="alert"
          className="bg-danger-bg border border-danger/30 text-danger-text text-sm px-3 py-2.5 rounded-lg"
        >
          {state.errors._form}
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-ink mb-1.5">
          Title
        </label>
        <Input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={defaults?.title}
          error={state.errors?.title}
          placeholder="e.g. iPhone 15 Pro Max 256GB Natural Titanium"
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Description
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={6}
          defaultValue={defaults?.description}
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink placeholder:text-neutral-400 px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400 focus:ring-offset-1"
          placeholder="Brand new, factory-sealed. Full warranty. Original Nigerian unit. Delivery available within Lagos. Serious buyers only."
        />
        {state.errors?.description && (
          <p className="text-xs text-danger mt-1.5">{state.errors.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="priceInput"
            className="block text-sm font-medium text-ink mb-1.5"
          >
            Price (Naira)
          </label>
          <Input
            id="priceInput"
            name="priceInput"
            type="text"
            inputMode="decimal"
            required
            defaultValue={defaults?.priceInput}
            error={state.errors?.priceInput}
            placeholder="2,000,000"
          />
        </div>

        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="negotiable"
              defaultChecked={defaults?.negotiable ?? false}
              className="h-5 w-5 rounded border-neutral-300 text-teal-600 focus:ring-teal-400"
            />
            <span className="text-sm text-ink">Price is negotiable</span>
          </label>
        </div>
      </div>

      <div>
        <label
          htmlFor="categoryId"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Category
        </label>
        <select
          id="categoryId"
          name="categoryId"
          required
          defaultValue={defaults?.categoryId ?? ""}
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400 focus:ring-offset-1"
        >
          <option value="" disabled>
            Choose a category
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {state.errors?.categoryId && (
          <p className="text-xs text-danger mt-1.5">{state.errors.categoryId}</p>
        )}
      </div>

      <div>
        <label htmlFor="stateId" className="block text-sm font-medium text-ink mb-1.5">
          State
        </label>
        <select
          id="stateId"
          name="stateId"
          required
          defaultValue={defaults?.stateId ?? ""}
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
        {state.errors?.stateId && (
          <p className="text-xs text-danger mt-1.5">{state.errors.stateId}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">Image URLs</label>
        <p className="text-xs text-ink-600 mb-2">
          Paste direct image URLs (https://...). Real upload coming soon. First image is
          the main one.
        </p>
        <div className="space-y-2">
          {imageUrls.map((url, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                type="url"
                name="imageUrls"
                value={url}
                onChange={(e) => updateUrl(idx, e.target.value)}
                placeholder="https://images.unsplash.com/photo-…"
                className="flex-1 bg-white border border-neutral-300 rounded-lg text-sm text-ink placeholder:text-neutral-400 px-3 py-2 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400 focus:ring-offset-1"
              />
              <button
                type="button"
                onClick={() => removeUrl(idx)}
                className="shrink-0 p-2 text-ink-600 hover:text-danger-text"
                aria-label={`Remove image ${idx + 1}`}
                disabled={imageUrls.length === 1}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addUrl}
          className="mt-2 text-sm text-teal-700 hover:text-teal-900 font-medium disabled:opacity-50"
          disabled={imageUrls.length >= 8}
        >
          + Add another image URL
        </button>
        {state.errors?.imageUrls && (
          <p className="text-xs text-danger mt-1.5">{state.errors.imageUrls}</p>
        )}
      </div>

      <SubmitButton submitLabel={submitLabel} pendingLabel={pendingLabel} />
    </form>
  );
}

function SubmitButton({
  submitLabel,
  pendingLabel,
}: {
  submitLabel: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending}>
      {pending ? pendingLabel : submitLabel}
    </Button>
  );
}
