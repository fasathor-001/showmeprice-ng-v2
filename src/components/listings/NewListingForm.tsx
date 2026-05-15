"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@/components/ui";
import type { ListingValidationErrors } from "@/lib/listings";
import { ImageUploader, type UploaderImage } from "./ImageUploader";

interface Category {
  id: string;
  name: string;
}
interface State {
  id: string;
  name: string;
}

interface Props {
  // Bound server action — createListingAction.
  action: (
    prev: { errors?: ListingValidationErrors } | null,
    formData: FormData
  ) => Promise<{ errors?: ListingValidationErrors }>;
  categories: Category[];
  states: State[];
  businessId: string;
  submitLabel?: string;
  pendingLabel?: string;
}

export function NewListingForm({
  action,
  categories,
  states,
  businessId,
  submitLabel = "Publish listing",
  pendingLabel = "Publishing…",
}: Props) {
  const [state, formAction] = useFormState(action, { errors: {} });
  // Pre-generate the product id at mount time so storage paths are stable
  // through every upload, regardless of how many re-renders happen between
  // first upload and form submission.
  const [productId] = useState<string>(() => crypto.randomUUID());
  const [images, setImages] = useState<UploaderImage[]>([]);

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state?.errors?._form && (
        <div
          role="alert"
          className="bg-danger-bg border border-danger/30 text-danger-text text-sm px-3 py-2.5 rounded-lg"
        >
          {state.errors._form}
        </div>
      )}

      <input type="hidden" name="productId" value={productId} />

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-ink mb-1.5">
          Title
        </label>
        <Input
          id="title"
          name="title"
          type="text"
          required
          error={state?.errors?.title}
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
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink placeholder:text-neutral-400 px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400 focus:ring-offset-1"
          placeholder="Brand new, factory-sealed. Full warranty. Original Nigerian unit. Delivery available within Lagos. Serious buyers only."
        />
        {state?.errors?.description && (
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
            error={state?.errors?.priceInput}
            placeholder="2,000,000"
          />
        </div>

        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="negotiable"
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
          defaultValue=""
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
        {state?.errors?.categoryId && (
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
          defaultValue=""
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
          <p className="text-xs text-danger mt-1.5">{state.errors.stateId}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">Images</label>
        <ImageUploader
          businessId={businessId}
          productId={productId}
          onChange={setImages}
        />
        {state?.errors?.imageUrls && (
          <p className="text-xs text-danger mt-1.5">{state.errors.imageUrls}</p>
        )}
      </div>

      <SubmitButton
        submitLabel={submitLabel}
        pendingLabel={pendingLabel}
        hasImages={images.length > 0}
      />
    </form>
  );
}

function SubmitButton({
  submitLabel,
  pendingLabel,
  hasImages,
}: {
  submitLabel: string;
  pendingLabel: string;
  hasImages: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      fullWidth
      disabled={pending || !hasImages}
    >
      {pending
        ? pendingLabel
        : !hasImages
          ? "Add at least one image"
          : submitLabel}
    </Button>
  );
}
