"use client";

import { useState } from "react";

interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}

/**
 * Unified product image component with:
 * - onError fallback to SVG placeholder (K-053)
 * - lazy-load + responsive sizing (K-055)
 *
 * Replaces raw <img> tags across ListingCard, ListingImageGallery,
 * and MessageSellerModal.
 */
export function ProductImage({
  src,
  alt,
  className,
  width,
  height,
  priority,
}: ProductImageProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <svg
        width={width ?? 40}
        height={height ?? 40}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
        className={className}
      >
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      onError={() => setHasError(true)}
    />
  );
}
