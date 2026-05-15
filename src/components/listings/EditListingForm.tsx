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

interface Defaults {
  title: string;
  description: string;
  priceInput: string;
  categoryId: string;
  stateId: string;
  negotiable: boolean;
}

interface Props {
  // Bound server action — updateListingAction.bind(null, productId).
  action: (
    prev: { errors?: ListingValidationErrors } | null,
    formData: FormData
  ) => Promise<{ errors?: ListingValidationErrors }>;
  categories: Category[];
  states: State[];
  businessId: string;
  productId: string;
  existingImages: UploaderImage[];
  defaults: Defaults;
}

export function EditListingForm({
  action,
  categories,
  states,
  businessId,
  productId,
  existingImages,
  defaults,
}: Props) {
  const [state, formAction] = useFormState(action, { errors: {} });
  const [images, setImages] = useState<UploaderImage[]>(existingImages);

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

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-ink mb-1.5">
          Title
        </label>
        <Input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={defaults.title}
          error={state?.errors?.title}
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
          defaultValue={defaults.description}
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink placeholder:text-neutral-400 px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400 focus:ring-offset-1"
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
            defaultValue={defaults.priceInput}
            error={state?.errors?.priceInput}
          />
        </div>

        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="negotiable"
              defaultChecked={defaults.negotiable}
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
          defaultValue={defaults.categoryId}
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400 focus:ring-offset-1"
        >
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
          defaultValue={defaults.stateId}
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400 focus:ring-offset-1"
        >
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
          existingImages={existingImages}
          onChange={setImages}
        />
        {state?.errors?.imageUrls && (
          <p className="text-xs text-danger mt-1.5">{state.errors.imageUrls}</p>
        )}
      </div>

      <SubmitButton hasImages={images.length > 0} />
    </form>
  );
}

function SubmitButton({ hasImages }: { hasImages: boolean }) {
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
        ? "Saving…"
        : !hasImages
          ? "Add at least one image"
          : "Save changes"}
    </Button>
  );
}
