// OTP server-action internals (Phase E Stage 2.A + Stage B).
//
// Shared constants and primitives used by both:
//   - src/app/(auth)/otp-actions.ts        (profile-phone OTP — original)
//   - src/app/(auth)/seller-otp-actions.ts (seller-WhatsApp OTP — E.2.11.0)
//
// Extracted from otp-actions.ts so the seller-WhatsApp flow can reuse exact
// same lifecycle primitives without duplicating (per the OTP-reuse investigation:
// parallel/additive design, not parameterizing the existing actions). Behavior
// is unchanged for the profile-phone flow — same constants, same rate-limit
// logic, same hash discipline.
//
// Server-only. Not imported from client code.

import type { SupabaseClient } from "@supabase/supabase-js";

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const MAX_SENDS_PER_PHONE_PER_HOUR = 3;
export const MAX_SENDS_PER_IP_PER_HOUR = 10;
export const MAX_VERIFY_ATTEMPTS = 5;

export function getSalt(): string {
  const s = process.env.OTP_HASH_SALT;
  if (!s) throw new Error("Missing required env var: OTP_HASH_SALT");
  return s;
}

/** Cloudflare-canonical client IP, falling back to the first x-forwarded-for hop. */
export function getClientIp(h: Headers): string | null {
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
}

export type OtpRateLimitResult = { ok: true } | { ok: false; error: string };

/**
 * Enforce the per-phone (3/hr) and per-IP (10/hr) OTP send rate limits.
 *
 * Both counts are taken across ALL phone_verifications rows for the given
 * phone/ip in the trailing hour — purpose-independent by design. A physical
 * number can only legitimately receive 3 codes per hour regardless of what
 * we're verifying it for (profile_phone vs. seller_whatsapp); same for the
 * per-IP budget. This is the correct semantics for both flows; do not add a
 * purpose filter here.
 *
 * Returns `{ ok: true }` on pass; `{ ok: false, error: <user-facing> }` on
 * either limit hit. Caller surfaces `error` directly.
 */
export async function checkOtpRateLimits(params: {
  admin: SupabaseClient;
  phone: string;
  ipHash: string | null;
}): Promise<OtpRateLimitResult> {
  const windowStartIso = new Date(Date.now() - RATE_WINDOW_MS).toISOString();

  const { count: phoneCount } = await params.admin
    .from("phone_verifications")
    .select("id", { count: "exact", head: true })
    .eq("phone", params.phone)
    .gte("created_at", windowStartIso);
  if ((phoneCount ?? 0) >= MAX_SENDS_PER_PHONE_PER_HOUR) {
    return {
      ok: false,
      error:
        "You've requested too many codes for this number. Please wait an hour and try again.",
    };
  }

  if (params.ipHash) {
    const { count: ipCount } = await params.admin
      .from("phone_verifications")
      .select("id", { count: "exact", head: true })
      .eq("request_ip_hash", params.ipHash)
      .gte("created_at", windowStartIso);
    if ((ipCount ?? 0) >= MAX_SENDS_PER_IP_PER_HOUR) {
      return {
        ok: false,
        error:
          "Too many verification attempts from your network. Please wait a while and try again.",
      };
    }
  }

  return { ok: true };
}
