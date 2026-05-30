import type { MetadataRoute } from "next";

// Feature I — Phase 1 PWA foundation.
//
// Next 14 App Router native manifest. This module exports a function
// that Next renders to a static `/manifest.webmanifest` at build time,
// served from the same origin as the app (`app.showmeprice.ng` in
// production). Bubblewrap (Phase 2) will read this URL during TWA
// init.
//
// Field choices:
//   - `start_url` / `scope` are relative ("/") so they resolve under
//     whatever host serves the app — same manifest works in preview
//     deploys and on prod without rebuilds.
//   - `display: "standalone"` is the TWA requirement; once installed,
//     the app opens without browser chrome.
//   - `orientation: "portrait"` matches the marketplace's mobile-first
//     reading flow (gallery → details → CTA stack).
//   - `theme_color` mirrors Tailwind teal-600 (#0d9488), the brand
//     accent used on the primary CTA, the verified badges, and the
//     hero eyebrow. Surfaces in the Android status bar in standalone
//     mode + the Chrome address-bar tint on the live web.
//   - `background_color: "#ffffff"` is the splash background Android
//     shows during cold-start before the first paint.
//   - `lang: "en-NG"` is English (Nigeria). Distinct from `en-US` for
//     locale-aware behavior (date/number formatting if ever needed).
//   - Icons declare both `purpose: "any"` and `purpose: "maskable"`
//     entries per size. The web manifest spec accepts the
//     space-separated form (`"any maskable"`) on a single entry, but
//     Next 14's TS types treat purpose as a single token — and
//     splitting into separate entries is the modern convention anyway,
//     unambiguous for every consumer (Bubblewrap, Chrome, Android
//     adaptive icons). The same PNG serves both purposes; it was
//     generated with safe-zone padding so adaptive-icon cropping on
//     Android doesn't clip the artwork.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ShowMePrice — Nigeria's verified marketplace",
    short_name: "ShowMePrice",
    description:
      "Real prices from verified Nigerian sellers, with direct WhatsApp contact when you're ready.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#0d9488",
    background_color: "#ffffff",
    lang: "en-NG",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
