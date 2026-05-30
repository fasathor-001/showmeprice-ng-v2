import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/reset-password",
  "/sell",
  "/listings/new",
  "/admin",
];
const AUTH_ONLY_PREFIXES = ["/sign-in", "/sign-up"];

// ----------------------------------------------------------------------
// Feature J.4 — account-suspension gate.
//
// Behavior contract (locked in J.1 review + J.4 plan):
//
//   - Routes a SUSPENDED user can still reach: public browse, static
//     info, auth flows, and the /suspended notice itself. Encoded in
//     SUSPENDED_ALLOWED_PREFIXES below. "/" is handled as an exact-match
//     special case (every pathname startsWith "/", so prefix matching
//     would over-allow).
//
//   - Carve-out: the /listings prefix is allowed (public detail pages),
//     but /listings/new + /listings/[id]/edit + /listings/[id]/delete
//     are mutation surfaces that suspended users MUST be blocked from.
//     The isListingsMutationPath helper checks the carve-out first so
//     these paths fall through to the suspension query even though
//     /listings is in the allowlist.
//
//   - Fail-open on profile-query error. A transient Supabase blip or
//     network hiccup means we can't read is_disabled — middleware
//     treats the user as active rather than locking out the entire
//     signed-in population. The defense-in-depth tier (J.4.1) will
//     catch server-action mutations server-side regardless.
//
//   - Missing profile row treated as ACTIVE here (asymmetric with
//     require-active-user.ts which treats missing as suspended). New
//     accounts mid-creation via the handle_new_user trigger may briefly
//     have an auth.users row without a profiles row; locking them out
//     mid-signup would be a real regression. Server actions are stricter
//     because they're only invoked from settled UI states.
//
//   - Suspension redirect strips ?next=. Locked decision: a suspended
//     user cannot "resume" a flow by signing back in — the suspension
//     persists across sessions. A ?next=/dashboard query would imply a
//     reachable post-redirect destination that will never succeed.
//
//   - Defense-in-depth wiring of require-active-user.ts into mutating
//     server actions is DEFERRED to J.4.1. Middleware is the load-
//     bearing defense; server-action POSTs flow through middleware too
//     (the matcher applies to all methods), so middleware catches the
//     vast majority of mutation attempts before action bodies execute.
//     J.4.1 will add per-action requireActiveUser() guards as belt-and-
//     braces against narrow race-condition windows.
// ----------------------------------------------------------------------

const SUSPENDED_ALLOWED_PREFIXES = [
  "/suspended",
  "/marketplace",
  "/categories",
  "/sellers",
  "/listings", // public detail; /listings/new + /listings/[id]/{edit,delete} carved out below
  "/faq",
  "/terms",
  "/privacy",
  "/cookie-policy",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/verify-phone",
  "/auth",
];

function isListingsMutationPath(pathname: string): boolean {
  return (
    pathname === "/listings/new" ||
    pathname.startsWith("/listings/new/") ||
    /^\/listings\/[^/]+\/(edit|delete)\/?$/.test(pathname)
  );
}

function isAllowedWhileSuspended(pathname: string): boolean {
  // Listings mutation carve-out runs FIRST — these paths look like the
  // /listings allowlist prefix but must NOT be allowed for suspended users.
  if (isListingsMutationPath(pathname)) return false;
  // Homepage exact-match special case ("/" is a prefix of every path).
  if (pathname === "/") return true;
  return SUSPENDED_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() refreshes the auth token cookie if needed. Must run before
  // any redirect decisions so cookies propagate even on a redirect response.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Feature J.4 — suspension gate. Runs BEFORE the existing unauth/auth
  // redirects below. Only applies when a user is signed in. Anonymous
  // visitors fall through to the existing PROTECTED_PREFIXES check.
  if (user && !isAllowedWhileSuspended(pathname)) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_disabled")
      .eq("id", user.id)
      .maybeSingle();

    // Fail-open: query error OR missing profile row → treat as active.
    // See header comment block for the asymmetry with require-active-user.ts.
    if (!profileError && profile?.is_disabled === true) {
      const url = request.nextUrl.clone();
      url.pathname = "/suspended";
      url.search = ""; // strip any query (no ?next=, no preserved filters)
      return NextResponse.redirect(url);
    }
  }

  if (!user && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && AUTH_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all routes except static assets, _next, and the auth callback.
    // The callback handles its own session exchange and must not be intercepted.
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
