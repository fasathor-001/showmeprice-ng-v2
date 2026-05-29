"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@/components/ui";
import type { ListingValidationErrors } from "@/lib/listings";
import { ImageUploader, type UploaderImage } from "./ImageUploader";
import {
  CategorySpecFields,
  type CategoryForSpecs,
} from "./CategorySpecFields";

type Category = CategoryForSpecs;

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
  /** Sprint 3 / Gap D.5: listing city/area. Legacy listings (pre-D.1) have
   *  NULL city_area → the edit page passes "" → empty input prompts the
   *  seller to backfill it (editing requires city_area per D.3). */
  cityArea: string;
  /** Existing category_specs values from the DB, keyed on spec field name. */
  categorySpecs?: Record<string, string | number>;
  /** E.2.17.0 / Step 2: existing per-listing stock count. Always set
   *  (DB column is NOT NULL DEFAULT 1; all rows have a value). */
  quantity: number;
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
  const [categoryId, setCategoryId] = useState<string>(defaults.categoryId);

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
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
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

      {/* Category-aware fields. Only re-prefills the defaults when the user
          keeps the same category — switching to a different category resets
          fields to empty (useState defaults wins over key-based remount, so
          we just rely on CategorySpecFields' own keying behaviour). */}
      <CategorySpecFields
        categories={categories}
        selectedCategoryId={categoryId}
        defaults={
          categoryId === defaults.categoryId ? defaults.categorySpecs : undefined
        }
      />

      {/* E.2.17.0 / Step 2: per-listing inventory quantity. Same shape
          as NewListingForm — conditional on the selected category's
          supports_inventory flag. Re-prefills the existing quantity
          only when the user kept the same category (matching the
          CategorySpecFields prefill discipline above). */}
      {(() => {
        const selectedCategory = categories.find((c) => c.id === categoryId);
        if (!selectedCategory?.supports_inventory) return null;
        const defaultQty =
          categoryId === defaults.categoryId ? String(defaults.quantity) : "1";
        return (
          <div>
            <label
              htmlFor="quantity"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              Available quantity
            </label>
            <Input
              id="quantity"
              name="quantity"
              type="text"
              inputMode="numeric"
              required
              defaultValue={defaultQty}
              error={state?.errors?.quantity}
              placeholder="1"
            />
            <p className="text-xs text-ink-600 mt-1">
              How many of this item do you have? Set to 0 when sold out.
            </p>
          </div>
        );
      })()}

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

      {/* Sprint 3 / Gap D.5: listing-level city/area. Prefilled from the
          existing row; legacy NULL → "" prompts backfill on edit. */}
      <div>
        <label htmlFor="cityArea" className="block text-sm font-medium text-ink mb-1.5">
          City / Area
        </label>
        <Input
          id="cityArea"
          name="cityArea"
          type="text"
          required
          defaultValue={defaults.cityArea}
          error={state?.errors?.cityArea}
          placeholder="e.g. Lekki Phase 1, Computer Village Ikeja"
        />
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
