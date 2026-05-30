// Feature I — Phase 1 service worker.
//
// Conservative caching policy. The investigation §5 flagged
// auth-cache-poisoning as the real bug class: the Header renders the
// signed-in user's display name + unread badge, so ANY HTML response
// from the app is auth-conditional. If we cached `/` and another user
// (or the same user signed out) loaded it from cache, the wrong name
// would render. Hence the strict allowlist below: HTML is NEVER cached
// for auth-aware routes, and `/` falls back to a static auth-free
// `/offline.html` only when the network fails.
//
// Bump CACHE_VERSION to invalidate everything on next activation.

const CACHE_VERSION = "showmeprice-v1";

// Pre-cached on install. Auth-free, version-stable assets only.
const STATIC_ASSETS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/favicon.svg",
  "/apple-touch-icon.svg",
];

// Static info routes — auth-free, cacheable. Network-first so updates
// land on next online navigation; fall back to cache when offline.
const STATIC_INFO_ROUTES = ["/faq", "/terms", "/privacy", "/cookie-policy"];

// Routes that render auth-conditional HTML or hit private data.
// NEVER cached. Network-only, no fallback (failures bubble to the
// browser's default error page rather than serve stale auth state).
const AUTH_AWARE_PREFIXES = [
  "/dashboard",
  "/settings",
  "/admin",
  "/messages",
  "/sell",
  "/auth",
  "/sign-in",
  "/sign-up",
  "/verify-phone",
  "/listings/",
  "/sellers/",
  "/categories/",
  "/marketplace",
];

self.addEventListener("install", (event) => {
  console.log("[sw] install — pre-caching static assets", CACHE_VERSION);
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  console.log("[sw] activate — pruning old caches");
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => {
              console.log("[sw] delete stale cache", key);
              return caches.delete(key);
            }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Non-GET → network only, never inspect or cache.
  if (request.method !== "GET") return;

  // Supabase API → network only. Auth tokens, RLS-scoped data.
  if (url.hostname.endsWith(".supabase.co")) return;

  // Cross-origin (other than Supabase, which we already returned on) →
  // let the browser handle it.
  if (url.origin !== self.location.origin) return;

  // Cache-first: long-lived static. Build-hashed JS/CSS, icons, brand
  // SVGs. Safe to serve from cache indefinitely.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/favicon.svg" ||
    url.pathname === "/apple-touch-icon.svg"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          // Only cache successful, basic responses.
          if (response.ok && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Static info routes (FAQ / Terms / Privacy / Cookie Policy):
  // network-first, fall back to cache. These are auth-free pages, so
  // caching them is safe — last-seen copy beats nothing when offline.
  if (STATIC_INFO_ROUTES.some((route) => url.pathname === route)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const clone = response.clone();
            caches
              .open(CACHE_VERSION)
              .then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/offline.html"))),
    );
    return;
  }

  // Auth-aware routes: NEVER cache. Network-only, no fallback. If the
  // network fails, the browser's default offline error renders — that's
  // the right UX vs. serving stale auth-conditional HTML to the wrong
  // user. This is the auth-cache-poisoning guard from investigation §5.
  if (AUTH_AWARE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    console.log("[sw] auth-aware route, network-only:", url.pathname);
    return;
  }

  // Homepage `/` — special case. The Header renders auth-conditional
  // HTML, so we MUST NOT cache the live response. But to give the
  // installed PWA something to show when offline, we fall back to the
  // static `/offline.html` instead. Live `/` is always fetched fresh.
  if (url.pathname === "/") {
    event.respondWith(
      fetch(request).catch(() => {
        console.log("[sw] / offline, serving offline.html");
        return caches.match("/offline.html");
      }),
    );
    return;
  }

  // Anything else (e.g. /manifest.webmanifest, /robots.txt if added
  // later, miscellaneous static files): let the browser handle it.
  // Default network behavior; we don't intercept.
});
