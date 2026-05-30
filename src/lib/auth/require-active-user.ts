import { createClient } from "@/lib/supabase/server";

// Feature J Stage 2 — auth guard for mutating server actions.
//
// Returns the user if they are signed in AND not suspended. Mirrors
// require-admin.ts shape (discriminated union + supabase client return
// for caller reuse). Stage J.4 will wire this into every mutating
// server action as defense-in-depth: middleware blocks navigation for
// suspended users, but a long-held request or race condition could
// still hit a server action between middleware passes — this helper
// is the last-line guard.
//
// Reads `profiles.is_disabled` via the authenticated client. Stage J.2
// adds the `profiles_self_read` RLS policy (auth.uid() = id) so this
// query succeeds even when the user is suspended; without that policy,
// the row would be invisible to the user themselves and the helper
// would mis-classify them as `unauthenticated`.
//
// Deliberately NOT re-exported from `src/lib/auth/index.ts` for the
// same reason as require-admin.ts: it imports the server-only Supabase
// client (next/headers). Deep-import this module directly.

export async function requireActiveUser(): Promise<
  | { ok: true; userId: string; supabase: ReturnType<typeof createClient> }
  | { ok: false; reason: "unauthenticated" | "suspended" }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_disabled")
    .eq("id", user.id)
    .maybeSingle();

  // Defensive: a missing profile row (shouldn't happen — every signed-in
  // user has a profile via the on_auth_user_created trigger) is treated
  // as suspended rather than active. Better to over-refuse than serve a
  // mutating action to a session whose profile state we can't read.
  if (!profile || profile.is_disabled === true) {
    return { ok: false, reason: "suspended" };
  }

  return { ok: true, userId: user.id, supabase };
}
