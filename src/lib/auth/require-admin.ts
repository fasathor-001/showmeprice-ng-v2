import { createClient } from "@/lib/supabase/server";

// Shared admin guard — faithful extraction of the private helper in
// src/app/(auth)/actions.ts (D-105 Commit 4). Returns a discriminated union
// and does NOT redirect, so both pages (redirect on !ok) and server actions
// (return an error on !ok) can consume it. Creates its own authenticated
// client and returns it so the caller can reuse one client for follow-up
// queries.
//
// Deliberately NOT re-exported from src/lib/auth/index.ts: it imports the
// server-only Supabase client (which pulls in next/headers), and the barrel is
// imported by client components (VerifyPhoneForm). Deep-import this module
// directly to avoid next/headers contagion in client bundles.
//
// Existing call sites (the /admin/verifications page inline guard and the
// private requireAdmin in actions.ts) are intentionally left unmigrated in
// this commit; consolidation is deferred to a later cleanup.
export async function requireAdmin(): Promise<
  | { ok: true; userId: string; supabase: ReturnType<typeof createClient> }
  | { ok: false; reason: "unauthenticated" | "not_admin" }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthenticated" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") return { ok: false, reason: "not_admin" };
  return { ok: true, userId: user.id, supabase };
}
