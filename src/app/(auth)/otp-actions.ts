"use server";

// Phase E Stage 2.A — phone OTP server actions.
//
// We own the OTP lifecycle: generate -> hash -> persist -> deliver (provider) /
// lookup -> validate -> atomic grant. The provider only delivers a rendered
// message. All phone_verifications access goes through the service-role admin
// client (the table is RLS-enabled with zero policies); the final grant goes
// through the SECURITY DEFINER mark_phone_verified function so the user can
// never self-grant 'phone_verified'.

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeNigerianWhatsApp } from "@/lib/auth/whatsapp";
import { getOtpProvider, OtpRateLimitedError } from "@/lib/otp";
import { sha256Hex } from "@/lib/otp/hash";
import { generateOtpCode } from "@/lib/otp/code";
import { renderOtpMessage } from "@/lib/otp/message";

export interface OtpActionState {
  ok?: boolean;
  error?: string;
}

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_SENDS_PER_PHONE_PER_HOUR = 3;
const MAX_SENDS_PER_IP_PER_HOUR = 10;
const MAX_VERIFY_ATTEMPTS = 5;

function getSalt(): string {
  const s = process.env.OTP_HASH_SALT;
  if (!s) throw new Error("Missing required env var: OTP_HASH_SALT");
  return s;
}

/** Cloudflare-canonical client IP, falling back to the first x-forwarded-for hop. */
function getClientIp(h: Headers): string | null {
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
}

/**
 * Generate + deliver a phone OTP for the signed-in user's stored phone.
 * Rate limits (per-phone 3/hr, per-IP 10/hr) are checked BEFORE generation.
 * A transient delivery failure rolls back the row so it doesn't burn the
 * user's hourly send budget.
 */
export async function sendPhoneOtpAction(
  _prev: OtpActionState | null,
  _formData: FormData,
): Promise<OtpActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in to verify your phone." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("phone, verification_status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.phone) {
    return { error: "No phone number on file. Update your profile first." };
  }
  if ((profile.verification_status ?? []).includes("phone_verified")) {
    return { ok: true }; // already verified — nothing to send
  }

  const phone = normalizeNigerianWhatsApp(profile.phone) ?? profile.phone;
  const admin = createAdminClient();
  const salt = getSalt();
  const windowStartIso = new Date(Date.now() - RATE_WINDOW_MS).toISOString();

  // Per-phone rate limit.
  const { count: phoneCount } = await admin
    .from("phone_verifications")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("created_at", windowStartIso);
  if ((phoneCount ?? 0) >= MAX_SENDS_PER_PHONE_PER_HOUR) {
    return {
      error:
        "You've requested too many codes for this number. Please wait an hour and try again.",
    };
  }

  // Per-IP rate limit (skipped when no client IP is resolvable).
  const rawIp = getClientIp(headers());
  const ipHash = rawIp ? await sha256Hex(`${salt}:${rawIp}`) : null;
  if (ipHash) {
    const { count: ipCount } = await admin
      .from("phone_verifications")
      .select("id", { count: "exact", head: true })
      .eq("request_ip_hash", ipHash)
      .gte("created_at", windowStartIso);
    if ((ipCount ?? 0) >= MAX_SENDS_PER_IP_PER_HOUR) {
      return {
        error:
          "Too many verification attempts from your network. Please wait a while and try again.",
      };
    }
  }

  // Generate, hash, persist.
  const code = generateOtpCode();
  const codeHash = await sha256Hex(`${salt}:${phone}:${code}`);
  const provider = getOtpProvider();

  const { data: inserted, error: insertErr } = await admin
    .from("phone_verifications")
    .insert({
      user_id: user.id,
      phone,
      code_hash: codeHash,
      channel: "sms",
      request_ip_hash: ipHash,
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      provider: provider.vendor,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    console.error("phone_verifications insert failed", insertErr?.message);
    return { error: "We couldn't send your verification code. Please try again." };
  }

  // Deliver. On failure, roll back the row so a vendor hiccup doesn't consume
  // the user's hourly send budget.
  try {
    await provider.sendOtp({
      to: phone,
      message: renderOtpMessage(code),
      channel: "sms",
    });
  } catch (err) {
    await admin.from("phone_verifications").delete().eq("id", inserted.id);
    if (err instanceof OtpRateLimitedError) {
      console.warn("OTP vendor rate-limited", provider.vendor);
      return {
        error:
          "Verification is temporarily unavailable. Please try again in a few minutes.",
      };
    }
    console.error("OTP send failed", provider.vendor, (err as Error)?.message);
    return { error: "We couldn't send your verification code. Please try again." };
  }

  return { ok: true };
}

/**
 * Verify a submitted code against the user's latest unconsumed OTP.
 * Validity (expiry, attempt cap, hash match) is gated here; the atomic
 * consume + grant is delegated to mark_phone_verified.
 */
export async function verifyPhoneOtpAction(
  _prev: OtpActionState | null,
  formData: FormData,
): Promise<OtpActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in to verify your phone." };

  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return { error: "Enter the 6-digit code." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("phone, verification_status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.phone) return { error: "No phone number on file." };
  if ((profile.verification_status ?? []).includes("phone_verified")) {
    return { ok: true };
  }

  const phone = normalizeNigerianWhatsApp(profile.phone) ?? profile.phone;
  const admin = createAdminClient();
  const salt = getSalt();

  const { data: row } = await admin
    .from("phone_verifications")
    .select("id, code_hash, expires_at, attempts_made, provider")
    .eq("user_id", user.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return { error: "No active code. Request a new one." };

  const nowIso = new Date().toISOString();

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await admin
      .from("phone_verifications")
      .update({ consumed_at: nowIso })
      .eq("id", row.id);
    return { error: "That code has expired. Request a new one." };
  }

  if (row.attempts_made >= MAX_VERIFY_ATTEMPTS) {
    await admin
      .from("phone_verifications")
      .update({ consumed_at: nowIso })
      .eq("id", row.id);
    return { error: "Too many incorrect attempts. Request a new code." };
  }

  const submittedHash = await sha256Hex(`${salt}:${phone}:${code}`);
  if (submittedHash !== row.code_hash) {
    await admin
      .from("phone_verifications")
      .update({ attempts_made: row.attempts_made + 1 })
      .eq("id", row.id);
    return { error: "Incorrect code. Please try again." };
  }

  // Match — atomic consume + grant via the SECURITY DEFINER function.
  const { data: ok, error: rpcErr } = await admin.rpc("mark_phone_verified", {
    p_verification_id: row.id,
    p_user_id: user.id,
    p_provider_tag: `${row.provider}_phone`,
  });
  if (rpcErr) {
    console.error("mark_phone_verified rpc failed", rpcErr.message);
    return { error: "Could not complete verification. Please try again." };
  }
  if (ok === true) return { ok: true };

  // false = couldn't atomically consume (e.g. a concurrent verify already
  // did). Re-check the profile: if it's now verified, treat as success.
  const { data: recheck } = await supabase
    .from("profiles")
    .select("verification_status")
    .eq("id", user.id)
    .maybeSingle();
  if ((recheck?.verification_status ?? []).includes("phone_verified")) {
    return { ok: true };
  }
  return { error: "Could not complete verification. Please try again." };
}
