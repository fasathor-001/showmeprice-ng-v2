/**
 * Storage URL helpers.
 *
 * product_images.storage_path holds the bucket-relative path of an uploaded
 * file (e.g. `{business_id}/{product_id}/{slot}-{timestamp}.png`). Renderers
 * must convert this to a fully-qualified Supabase Storage public URL before
 * passing it to an `<img src>` — otherwise the browser treats it as a path
 * relative to the current route and 404s (Phase D.2.1 bug).
 *
 * Pure URL construction — no Supabase client roundtrip. Works equally in
 * server components, client components, and edge runtime.
 */

const PRODUCT_IMAGES_BUCKET = "product-images";

function publicBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is required for storage URL construction"
    );
  }
  return base;
}

export function getProductImagePublicUrl(storagePath: string): string {
  return `${publicBaseUrl()}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${storagePath}`;
}
