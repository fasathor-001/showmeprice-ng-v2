// Stage 2.C Commit 9-a — feature flag plumbing.
//
// Single source of truth for the image-messaging feature flag.
// `NEXT_PUBLIC_IMAGE_MESSAGES` is read at build time on the client (Next.js
// inlines NEXT_PUBLIC_* env vars during build) and per-request on the
// server (process.env access).
//
// Toggling the flag in Cloudflare Pages env vars requires a redeploy for
// client-side changes to take effect — accepted per F.3 approval (single
// flag, no sub-flags, build-time inlining accepted; runtime client-side
// flag retrieval was deemed not worth the network round-trip).
//
// Defense in depth (per F.1 + 9-a.N3 + 9-c.N7):
//   · Client: ImageAttachButton conditionally renders based on this helper
//   · Server: sendImageMessage / mintMessageImageUploadUrls / mintMessageImageUrls
//     all refuse if this helper returns false
// Both layers must permit the action for the path to work.

/**
 * Returns true if image messaging is enabled in this build / runtime.
 *
 * Implementation note: pure function (no state), safe to call from any
 * runtime — server actions, edge middleware, client components alike.
 */
export function isImageMessagingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_IMAGE_MESSAGES === "true";
}
