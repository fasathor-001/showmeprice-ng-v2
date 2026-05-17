/**
 * Category-aware listing fields. Each top-level category that needs extra
 * fields declares its shape here; subcategories without their own entry
 * fall back to the parent (via getSpecsForCategory). Values are stored in
 * products.category_specs as JSONB.
 *
 * Adding a new spec is editing this file — no migration needed.
 */

export type SpecFieldType = "select" | "text" | "number";

export interface SpecField {
  name: string;
  label: string;
  type: SpecFieldType;
  /** Required for type='select' */
  options?: string[];
  required?: boolean;
  /** Optional placeholder / hint shown under the field. */
  hint?: string;
}

export interface CategorySpecsConfig {
  fields: SpecField[];
}

export const CATEGORY_SPECS: Record<string, CategorySpecsConfig> = {
  // Phones / tablets. Smartphones-new, smartphones-used, tablets, etc.
  // inherit via the parent fallback.
  "mobile-phones-tablets": {
    fields: [
      {
        name: "condition",
        label: "Condition",
        type: "select",
        options: ["New (sealed)", "UK-used", "Nigerian-used", "For parts"],
        required: true,
      },
    ],
  },

  // Computers — same condition picker; laptops, desktops, monitors all
  // inherit via parent fallback.
  "computer-accessories": {
    fields: [
      {
        name: "condition",
        label: "Condition",
        type: "select",
        options: ["New (sealed)", "UK-used", "Nigerian-used", "For parts"],
        required: true,
      },
    ],
  },

  // Electronics & Gadgets (TVs / audio / gaming / smart home / solar).
  electronics: {
    fields: [
      {
        name: "condition",
        label: "Condition",
        type: "select",
        options: ["New (sealed)", "UK-used", "Nigerian-used", "For parts"],
        required: true,
      },
    ],
  },

  // Fashion (men's/women's/kids' clothing, ankara, shoes, accessories all
  // inherit via parent fallback).
  fashion: {
    fields: [
      {
        name: "size",
        label: "Size",
        type: "text",
        required: false,
        hint: "e.g. M, 42, UK 9",
      },
      { name: "color", label: "Color", type: "text", required: false },
    ],
  },

  // Automotive / vehicles. The Phase D taxonomy uses 'vehicles' as the slug
  // (with the display name 'Automotive'). No subcategories exist live today;
  // listings post under the parent directly.
  vehicles: {
    fields: [
      {
        name: "year",
        label: "Year",
        type: "number",
        required: true,
        hint: "e.g. 2018",
      },
      {
        name: "mileage_km",
        label: "Mileage (km)",
        type: "number",
        required: false,
      },
    ],
  },

  // Property. Independent of the verification-limits warning banner — that's
  // a copy concern; this is the data shape.
  property: {
    fields: [
      {
        name: "property_type",
        label: "Property type",
        type: "select",
        options: ["Apartment", "House", "Land", "Commercial"],
        required: true,
      },
      {
        name: "bedrooms",
        label: "Bedrooms",
        type: "number",
        required: false,
      },
      {
        name: "bathrooms",
        label: "Bathrooms",
        type: "number",
        required: false,
      },
    ],
  },
};

/**
 * Resolve which spec schema applies to a given category. Falls back to the
 * parent's schema if the subcategory has none of its own. Returns null when
 * no schema is defined at either level.
 */
export function getSpecsForCategory(
  categorySlug: string | null | undefined,
  parentSlug: string | null | undefined
): CategorySpecsConfig | null {
  if (categorySlug && CATEGORY_SPECS[categorySlug]) {
    return CATEGORY_SPECS[categorySlug];
  }
  if (parentSlug && CATEGORY_SPECS[parentSlug]) {
    return CATEGORY_SPECS[parentSlug];
  }
  return null;
}

/**
 * Build a usable label for a stored spec value. e.g. category_specs has
 * { mileage_km: 35000 } -> "Mileage (km)". If the schema has been changed
 * since the listing was created, falls back to a title-cased version of the
 * key so old records still render readably.
 */
export function labelForSpec(
  schema: CategorySpecsConfig | null,
  fieldName: string
): string {
  const found = schema?.fields.find((f) => f.name === fieldName);
  if (found) return found.label;
  return fieldName
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Coerce a string value into the type the schema expects. Numbers come out
 * as numbers (null on parse failure); selects/text stay as strings.
 */
export function coerceSpecValue(
  field: SpecField,
  raw: string
): string | number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (field.type === "number") {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return trimmed;
}

/**
 * Server-side: parse + validate the `spec_<field>` keys from a FormData
 * against a category's spec schema. Returns the parsed object (or null if
 * there's nothing worth storing), plus an error string for the first
 * required field that's missing or any number-parse failure.
 */
export function parseSpecsFromFormData(
  schema: CategorySpecsConfig | null,
  formData: FormData
): {
  specs: Record<string, string | number> | null;
  error: string | null;
} {
  if (!schema) return { specs: null, error: null };
  const specs: Record<string, string | number> = {};
  for (const field of schema.fields) {
    const raw = String(formData.get(`spec_${field.name}`) ?? "").trim();
    if (!raw) {
      if (field.required) {
        return { specs: null, error: `${field.label} is required` };
      }
      continue;
    }
    const coerced = coerceSpecValue(field, raw);
    if (coerced === null && field.type === "number") {
      return {
        specs: null,
        error: `${field.label} must be a valid number`,
      };
    }
    if (coerced !== null) specs[field.name] = coerced;
  }
  return {
    specs: Object.keys(specs).length > 0 ? specs : null,
    error: null,
  };
}
