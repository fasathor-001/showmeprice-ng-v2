"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui";
import {
  getSpecsForCategory,
  type CategorySpecsConfig,
} from "@/lib/categorySpecs";

export interface CategoryForSpecs {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}

interface Props {
  categories: CategoryForSpecs[];
  /** The currently-selected category id (controlled by the parent form). */
  selectedCategoryId: string;
  /** Pre-fill values when editing an existing listing. */
  defaults?: Record<string, string | number>;
}

/**
 * Dynamic listing fields driven by the selected category. Reads the schema
 * from CATEGORY_SPECS via getSpecsForCategory (which handles parent
 * fallback so subcategories inherit their parent's fields).
 *
 * Field names are prefixed `spec_<name>` in the form so the server action
 * can pick them up generically and build the category_specs JSONB.
 */
export function CategorySpecFields({
  categories,
  selectedCategoryId,
  defaults,
}: Props) {
  const schema = useMemo<CategorySpecsConfig | null>(() => {
    if (!selectedCategoryId) return null;
    const chosen = categories.find((c) => c.id === selectedCategoryId);
    if (!chosen) return null;
    const parent = chosen.parent_id
      ? (categories.find((c) => c.id === chosen.parent_id) ?? null)
      : null;
    return getSpecsForCategory(chosen.slug, parent?.slug ?? null);
  }, [categories, selectedCategoryId]);

  if (!schema || schema.fields.length === 0) return null;

  return (
    <fieldset className="space-y-3 pt-2 border-t border-neutral-200">
      <legend className="text-xs font-medium text-ink-600 uppercase tracking-wide">
        Details for this category
      </legend>
      {schema.fields.map((field) => {
        const fieldName = `spec_${field.name}`;
        const defaultValue =
          defaults && defaults[field.name] !== undefined
            ? String(defaults[field.name])
            : "";

        if (field.type === "select") {
          return (
            <div key={field.name}>
              <label
                htmlFor={fieldName}
                className="block text-sm font-medium text-ink mb-1.5"
              >
                {field.label}
                {field.required && (
                  <span className="text-danger ml-0.5" aria-hidden="true">
                    *
                  </span>
                )}
              </label>
              <select
                id={fieldName}
                name={fieldName}
                required={field.required}
                defaultValue={defaultValue}
                className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400"
              >
                <option value="" disabled>
                  Choose {field.label.toLowerCase()}
                </option>
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              {field.hint && (
                <p className="text-xs text-ink-600 mt-1">{field.hint}</p>
              )}
            </div>
          );
        }

        return (
          <div key={field.name}>
            <label
              htmlFor={fieldName}
              className="block text-sm font-medium text-ink mb-1.5"
            >
              {field.label}
              {field.required && (
                <span className="text-danger ml-0.5" aria-hidden="true">
                  *
                </span>
              )}
            </label>
            <Input
              id={fieldName}
              name={fieldName}
              type={field.type === "number" ? "text" : "text"}
              inputMode={field.type === "number" ? "numeric" : undefined}
              required={field.required}
              defaultValue={defaultValue}
              placeholder={field.hint}
            />
            {field.hint && (
              <p className="text-xs text-ink-600 mt-1">{field.hint}</p>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
