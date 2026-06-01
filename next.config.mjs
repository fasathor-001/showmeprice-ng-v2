/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Allow next/image <Image> to render assets from the Supabase Storage
    // public-objects path on this project's storage host. Without this,
    // <Image> rejects external hostnames and renders the browser's
    // broken-image glyph (observed on kay_interiors_hub's avatar after
    // re-upload; root cause confirmed by direct-GET succeeding while the
    // <Image>-wrapped render failed). Listings dodged this because
    // ProductImage.tsx uses a plain <img>; avatars use <Image>.
    //
    // Scoped to /storage/v1/object/public/** — only public storage
    // objects, not signed-URL paths or the auth/storage management
    // endpoints. Private buckets (verification-id-documents,
    // verification-selfies) continue to be served via signed URLs and
    // do NOT need allowlisting here.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'aihpvpaxrpkqcujqovzr.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
