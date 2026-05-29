// E.2.16.0 Step 3 — shared admin user-search helper. Extracted from
// /admin/staff/actions.ts:searchUsersAction so two surfaces can share the
// expensive auth.admin.listUsers + profiles lookup:
//   • /admin/staff       → excludeAdmins:true, excludeDisabled:true   (promote-to-admin candidates only)
//   • /admin/users       → excludeAdmins:false, excludeDisabled:false (full directory for phone/location changes)
//
// Adds phone-substring matching on top of the original name/email match:
// the query is run through normalizeNigerianWhatsApp; if it normalizes to
// a canonical NG E.164 fragment we also match it against profile.phone.
// (Sub-canonical fragments like "234801" also match because we do plain
// includes() once we have something to compare against.)
//
// LIMITATION carried forward from the original: auth.admin.listUsers caps at
// 200 per page — users beyond that aren't searchable. Acceptable at MVP scale.
// Replace with a scalable hybrid (profiles ILIKE + per-id auth lookup) when
// total user count approaches the cap.

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeNigerianWhatsApp } from "@/lib/auth";

export interface AdminUserSearchHit {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  role: string | null;
  isDisabled: boolean;
}

export interface SearchUsersOptions {
  query: string;
  excludeAdmins: boolean;
  excludeDisabled: boolean;
  /** Override per-call; defaults to 10. */
  limit?: number;
}

export interface SearchUsersResult {
  users?: AdminUserSearchHit[];
  error?: string;
}

const SEARCH_MIN = 3;
const DEFAULT_LIMIT = 10;
const LIST_PAGE_SIZE = 200;

/**
 * Caller is responsible for the admin gate — this helper does NOT call
 * requireAdmin. It only uses the service-role client to read auth.users +
 * profiles, which is itself privileged; do not expose this directly.
 */
export async function searchUsers(
  opts: SearchUsersOptions,
): Promise<SearchUsersResult> {
  const q = opts.query.trim().toLowerCase();
  if (q.length < SEARCH_MIN) return { users: [] };

  const limit = opts.limit ?? DEFAULT_LIMIT;
  const admin = createAdminClient();

  // Normalize the query for phone-substring matching. If it's not even a
  // partial NG number this returns null and we just skip the phone branch.
  // We also accept any digit-only query as a phone fragment (digits >= 3).
  const rawDigits = q.replace(/\D/g, "");
  const normalizedPhone = normalizeNigerianWhatsApp(q);
  const phoneNeedle = normalizedPhone ?? (rawDigits.length >= 3 ? rawDigits : null);

  const { data: authList, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: LIST_PAGE_SIZE,
  });
  if (listErr) {
    console.error("[searchUsers] listUsers failed", listErr.message);
    return { error: "Search is temporarily unavailable. Please try again." };
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name, phone, role, is_disabled")
    .limit(LIST_PAGE_SIZE);

  type ProfileLite = {
    id: string;
    display_name: string | null;
    phone: string | null;
    role: string | null;
    is_disabled: boolean;
  };
  const profileById = new Map<string, ProfileLite>(
    ((profiles ?? []) as ProfileLite[]).map((p) => [p.id, p]),
  );

  const matches: AdminUserSearchHit[] = [];
  for (const u of authList?.users ?? []) {
    const p = profileById.get(u.id);
    if (opts.excludeAdmins && p?.role === "admin") continue;
    if (opts.excludeDisabled && p?.is_disabled) continue;

    const email = (u.email ?? "").toLowerCase();
    const name = (p?.display_name ?? "").toLowerCase();
    const phone = p?.phone ?? null;

    const emailHit = email.includes(q);
    const nameHit = name.includes(q);
    const phoneHit = phoneNeedle != null && phone != null && phone.includes(phoneNeedle);

    if (emailHit || nameHit || phoneHit) {
      matches.push({
        id: u.id,
        email: u.email ?? "—",
        displayName: p?.display_name ?? "—",
        phone,
        role: p?.role ?? null,
        isDisabled: p?.is_disabled ?? false,
      });
      if (matches.length >= limit) break;
    }
  }
  return { users: matches };
}
