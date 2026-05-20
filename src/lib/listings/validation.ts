import { parseNairaInputToKobo, isValidImageUrl } from "./format";

export interface ListingFormData {
  title: string;
  description: string;
  priceInput: string;
  categoryId: string;
  stateId: string;
  negotiable: boolean;
  imageUrls: string[];
}

export interface ListingValidationErrors {
  title?: string;
  description?: string;
  priceInput?: string;
  categoryId?: string;
  stateId?: string;
  imageUrls?: string;
  cityArea?: string;
  _form?: string;
}

export function validateTitle(title: string): string | undefined {
  if (!title || !title.trim()) return "Title is required";
  if (title.trim().length < 5) return "Title must be at least 5 characters";
  if (title.trim().length > 120) return "Title is too long (max 120 characters)";
  return undefined;
}

export function validateDescription(description: string): string | undefined {
  if (!description || !description.trim()) return "Description is required";
  if (description.trim().length < 20)
    return "Description must be at least 20 characters";
  if (description.trim().length > 2000)
    return "Description is too long (max 2000 characters)";
  return undefined;
}

export function validatePrice(priceInput: string): string | undefined {
  if (!priceInput || !priceInput.trim()) return "Price is required";
  const kobo = parseNairaInputToKobo(priceInput);
  if (kobo === null) return "Enter a valid Naira amount (e.g. 50,000)";
  if (kobo < 100) return "Price must be at least ₦1";
  if (kobo > 100_000_000_000) return "Price is too high (max ₦1,000,000,000)";
  return undefined;
}

export function validateCategoryId(id: string): string | undefined {
  if (!id) return "Category is required";
  return undefined;
}

export function validateStateId(id: string): string | undefined {
  if (!id) return "State is required";
  return undefined;
}

// Sprint 3 / Gap D.2: listing-level city/area (location beyond state).
// Validated per-action (not wired into validateListingForm) — matches the
// imageUrls per-action pattern in createListingAction. Required for new
// listings even though the products.city_area column is nullable (the
// column is nullable to tolerate legacy listings created before the
// field existed; new listings must supply it).
export function validateCityArea(cityArea: string): string | undefined {
  if (!cityArea || !cityArea.trim()) return "City / area is required";
  const trimmed = cityArea.trim();
  if (trimmed.length < 3) return "City / area must be at least 3 characters";
  if (trimmed.length > 100)
    return "City / area is too long (max 100 characters)";
  return undefined;
}

export function validateImageUrls(urls: string[]): string | undefined {
  if (!urls || urls.length === 0) return "Add at least one image URL";
  if (urls.length > 8) return "Maximum 8 images per listing";
  for (const url of urls) {
    if (!isValidImageUrl(url)) return `Invalid image URL: ${url.slice(0, 60)}…`;
  }
  return undefined;
}

export function validateListingForm(data: ListingFormData): ListingValidationErrors {
  return {
    title: validateTitle(data.title),
    description: validateDescription(data.description),
    priceInput: validatePrice(data.priceInput),
    categoryId: validateCategoryId(data.categoryId),
    stateId: validateStateId(data.stateId),
    imageUrls: validateImageUrls(data.imageUrls),
  };
}

export function hasErrors(errors: ListingValidationErrors): boolean {
  return Object.values(errors).some((v) => v !== undefined);
}
