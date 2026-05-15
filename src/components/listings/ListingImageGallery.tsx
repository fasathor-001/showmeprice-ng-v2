"use client";

import { useEffect, useState } from "react";

interface GalleryImage {
  storage_path: string;
  public_url: string;
}

interface Props {
  images: GalleryImage[];
  title: string;
}

/**
 * Listing-detail image gallery.
 *
 * - Tap a thumbnail to swap the primary view.
 * - Tap the primary view to open a fullscreen lightbox.
 * - In the lightbox: ← / → arrows navigate, Esc closes, click backdrop closes.
 *
 * No third-party lightbox library — keeps the bundle lean and the focus
 * trap predictable. We just rely on body scroll-lock + a global keydown
 * listener while open.
 */
export function ListingImageGallery({ images, title }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Clamp on prop change (defensive — image set might shrink between renders).
  useEffect(() => {
    if (selectedIndex >= images.length) setSelectedIndex(0);
  }, [images.length, selectedIndex]);

  // Lightbox keyboard nav + scroll lock.
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      else if (e.key === "ArrowLeft")
        setSelectedIndex((i) => (i - 1 + images.length) % images.length);
      else if (e.key === "ArrowRight")
        setSelectedIndex((i) => (i + 1) % images.length);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightboxOpen, images.length]);

  if (images.length === 0) {
    return (
      <div className="aspect-square bg-neutral-100 rounded-xl overflow-hidden flex items-center justify-center text-neutral-300">
        <svg
          width="80"
          height="80"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      </div>
    );
  }

  const current = images[selectedIndex];

  return (
    <div>
      {/* Primary image — click to open lightbox.
          Phase D.3.1: dropped the fixed aspect-ratio container and the grey
          background so the image renders at its natural shape (capped at
          max-height) without visible letterbox bars. Landscape photos fill
          the column width edge-to-edge; portrait photos float on white that
          blends with the page background. */}
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="block w-full max-h-[60vh] sm:max-h-[700px] mb-3 rounded-xl overflow-hidden bg-white cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        aria-label={`View ${title} image ${selectedIndex + 1} of ${images.length} fullscreen`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.public_url}
          alt={`${title} — image ${selectedIndex + 1}`}
          className="block w-full max-h-[60vh] sm:max-h-[700px] object-contain"
        />
      </button>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto sm:grid sm:grid-cols-5 sm:overflow-visible pb-1">
          {images.map((img, idx) => (
            <button
              key={img.storage_path}
              type="button"
              onClick={() => setSelectedIndex(idx)}
              aria-label={`Show image ${idx + 1}`}
              aria-current={idx === selectedIndex ? "true" : "false"}
              className={`shrink-0 w-20 sm:w-auto aspect-square rounded-lg overflow-hidden border-2 transition ${
                idx === selectedIndex
                  ? "border-teal-600 ring-1 ring-teal-600/20"
                  : "border-neutral-200 hover:border-neutral-400 opacity-75 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.public_url}
                alt=""
                className="w-full h-full object-cover bg-neutral-100"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox overlay */}
      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} image viewer`}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={(e) => {
            // Close only on backdrop, not on image / nav button clicks.
            if (e.target === e.currentTarget) setLightboxOpen(false);
          }}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label="Close image viewer"
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-black/40 hover:bg-black/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          {/* Prev/Next nav (only with >1 image) */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() =>
                  setSelectedIndex(
                    (i) => (i - 1 + images.length) % images.length
                  )
                }
                aria-label="Previous image"
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-3 rounded-full bg-black/40 hover:bg-black/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedIndex((i) => (i + 1) % images.length)
                }
                aria-label="Next image"
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-3 rounded-full bg-black/40 hover:bg-black/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </>
          )}

          {/* Counter */}
          {images.length > 1 && (
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium bg-black/40 px-3 py-1 rounded-full">
              {selectedIndex + 1} / {images.length}
            </p>
          )}

          {/* Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.public_url}
            alt={`${title} — image ${selectedIndex + 1}`}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </div>
  );
}
