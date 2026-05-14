import { createClient as createSbClient } from "@supabase/supabase-js";

// Service role client — bypasses RLS. Server-side only. Never import from a client component.
export function createAdminClient() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
