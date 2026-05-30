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
// E.2.18.0: public-read bucket for seller business avatars/logos. Path
// shape `{business_id}/avatar-{timestamp}.{ext}` per the bucket's RLS.
const BUSINESS_AVATARS_BUCKET = "business-avatars";

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

/**
 * Public URL for a business avatar storage path. NULL-safe: returns null
 * when the path is null/empty, which lets render-side `<Avatar src=...>`
 * accept the result directly (the component falls back to initials when
 * src is null). Mirrors getProductImagePublicUrl shape — pure URL
 * construction, no Supabase client roundtrip, works in edge + server +
 * client contexts.
 */
export function getBusinessAvatarPublicUrl(
  storagePath: string | null | undefined
): string | null {
  if (!storagePath) return null;
  return `${publicBaseUrl()}/storage/v1/object/public/${BUSINESS_AVATARS_BUCKET}/${storagePath}`;
}
