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
  // (display name 'Automotive'). The seed has 4 subcategories live: `cars`,
  // `motorcycles`, `tricycles`, `vehicle-parts`. The 9-field set below
  // applies to `cars`, `motorcycles`, and `tricycles` via parent-fallback
  // in getSpecsForCategory. `vehicle-parts` carries its own minimal
  // override below (parts don't have mileage / transmission / fuel /
  // registration concerns).
  //
  // Stage 1 of the vehicle-marketplace upgrade — structured fields that
  // make car listings credible without overpromising inspection or
  // ownership verification. Field declaration order = display order on
  // the public detail page (parseSpecsFromFormData persists into JSONB
  // in this order; the detail page iterates Object.entries on read).
  vehicles: {
    fields: [
      {
        name: "make",
        label: "Make",
        type: "text",
        required: true,
        hint: "e.g. Toyota, Honda, Mercedes-Benz",
      },
      {
        name: "model",
        label: "Model",
        type: "text",
        required: true,
        hint: "e.g. Camry, Accord, C-Class",
      },
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
        required: true,
        hint: "e.g. 85000",
      },
      {
        name: "condition_grade",
        label: "Condition",
        type: "select",
        options: ["Brand new", "Tokunbo (foreign-used)", "Nigerian-used"],
        required: true,
      },
      {
        name: "transmission",
        label: "Transmission",
        type: "select",
        options: ["Automatic", "Manual"],
        required: true,
      },
      {
        name: "fuel_type",
        label: "Fuel type",
        type: "select",
        options: ["Petrol", "Diesel", "Hybrid", "Electric"],
        required: true,
      },
      {
        name: "registration_status",
        label: "Registration",
        type: "select",
        options: ["Registered", "Unregistered", "Custom papers only"],
        required: true,
      },
      {
        name: "engine_size",
        label: "Engine size (cc)",
        type: "number",
        required: false,
        hint: "e.g. 2000",
      },
    ],
  },

  // Vehicle parts — minimal override. Parts are typically inventory-tracked
  // (NG parts vendors stock multiple identical units, per D-141), so the
  // form needs less detail than the full-vehicle set: make + model
  // identify what the part fits; year is optional (parts often span
  // multiple model years); condition_grade uses the parts-specific enum
  // (Refurbished is a real category for rebuilt parts; Tokunbo /
  // Nigerian-used distinctions don't apply at the part level).
  "vehicle-parts": {
    fields: [
      {
        name: "make",
        label: "Make",
        type: "text",
        required: true,
        hint: "e.g. Toyota, Honda",
      },
      {
        name: "model",
        label: "Model",
        type: "text",
        required: true,
        hint: "e.g. Camry, Accord",
      },
      {
        name: "year",
        label: "Year",
        type: "number",
        required: false,
        hint: "e.g. 2018",
      },
      {
        name: "condition_grade",
        label: "Condition",
        type: "select",
        options: ["Brand new", "Refurbished", "Used"],
        required: true,
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
