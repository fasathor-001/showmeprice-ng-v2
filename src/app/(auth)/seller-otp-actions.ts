"use server";

// Phase E Stage B — seller-WhatsApp OTP server actions (E.2.11.0 lane).
//
// Sibling to otp-actions.ts. Parallel/additive design (per the OTP-reuse
// investigation): the existing profile-phone flow is untouched in behavior;
// these actions target an ARBITRARY number provided by the seller (which may
// be different from their already-verified profiles.phone) and stamp the
// resulting phone_verifications row with purpose='seller_whatsapp'.
//
// Discipline:
//   * Hash is derived against the TARGET phone (NOT profile.phone). Verify
//     re-derives against v_row.phone (the row's own number), so the stored
//     value is provably the one the user controlled.
//   * Verify-success calls mark_seller_whatsapp_verified (NOT mark_phone_verified)
//     — does NOT grant profile-level phone_verified, does NOT touch
//     profiles.phone / verification_status / auth_providers, does NOT
//     dispatch the welcome email.
//   * No "already verified → return ok" shortcut: the seller may already be
//     phone_verified for their profile phone, which is irrelevant to whether
//     they control a DIFFERENT WhatsApp number.
//   * Rate limits are reused from server-internals — they're phone- and
//     IP-keyed (purpose-independent), correct for both lanes.
//
// Stage C dependency (flagged, not solved here): the mark_seller_whatsapp_verified
// RPC requires a businesses row to exist for the user (looks it up via
// UNIQUE owner_id). The orchestration with becomeSellerAction (which creates
// the business) lives in Stage C — for now, this action calls the RPC and
// propagates a generic error when the RPC returns false (which covers both
// "no business" and "concurrent consume").

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeNigerianWhatsApp,
  isPlausibleNigerianMobile,
} from "@/lib/auth/whatsapp";
import { getOtpProvider, OtpRateLimitedError } from "@/lib/otp";
import { sha256Hex } from "@/lib/otp/hash";
import { generateOtpCode } from "@/lib/otp/code";
import { renderOtpMessage } from "@/lib/otp/message";
import {
  OTP_TTL_MS,
  MAX_VERIFY_ATTEMPTS,
  getSalt,
  getClientIp,
  checkOtpRateLimits,
} from "@/lib/otp/server-internals";

export interface SellerOtpSendState {
  ok?: boolean;
  error?: string;
  /** On success: the verification row id (informational; verify resolves via newest-unconsumed lookup). */
  verificationId?: string;
  /** On success: the canonical target phone the OTP was sent to. */
  targetPhone?: string;
}

export interface SellerOtpVerifyState {
  ok?: boolean;
  error?: string;
}

/**
 * Generate + deliver a phone OTP for an arbitrary target number (the seller's
 * WhatsApp number). The target is read from FormData ("phone"), normalized,
 * and validated as a Nigerian mobile.
 *
 * Unlike sendPhoneOtpAction, this:
 *   * does NOT read profile.phone
 *   * does NOT consult profile.verification_status (no early-return shortcut)
 *   * stamps the row with purpose='seller_whatsapp'
 *   * hashes against the TARGET number, not the profile phone
 */
export async function sendSellerPhoneOtpAction(
  _prev: SellerOtpSendState | null,
  formData: FormData,
): Promise<SellerOtpSendState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  const rawTarget = String(formData.get("phone") ?? "").trim();
  if (!rawTarget) return { error: "Enter a WhatsApp number." };

  const normalized = normalizeNigerianWhatsApp(rawTarget);
  if (!normalized || !isPlausibleNigerianMobile(normalized)) {
    return { error: "Enter a valid Nigerian mobile number." };
  }

  const phone = normalized;
  const admin = createAdminClient();
  const salt = getSalt();

  // Rate limits — reuse the same helpers as the profile-phone flow. Per-phone
  // and per-IP counts span ALL purposes by design (a physical number /
  // network can only legitimately receive N codes per hour regardless of why).
  const rawIp = getClientIp(headers());
  const ipHash = rawIp ? await sha256Hex(`${salt}:${rawIp}`) : null;
  const rl = await checkOtpRateLimits({ admin, phone, ipHash });
  if (!rl.ok) return { error: rl.error };

  // Generate, hash against the TARGET phone, persist with seller_whatsapp purpose.
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
      purpose: "seller_whatsapp",
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    console.error("seller phone_verifications insert failed", insertErr?.message);
    return { error: "We couldn't send your verification code. Please try again." };
  }

  // Deliver. On failure, roll back the row so a vendor hiccup doesn't burn
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
      console.warn("OTP vendor rate-limited (seller)", provider.vendor);
      return {
        error:
          "Verification is temporarily unavailable. Please try again in a few minutes.",
      };
    }
    console.error("OTP send failed (seller)", provider.vendor, (err as Error)?.message);
    return { error: "We couldn't send your verification code. Please try again." };
  }

  return { ok: true, verificationId: inserted.id, targetPhone: phone };
}

/**
 * Verify a submitted code against the newest unconsumed seller-whatsapp OTP
 * for the signed-in user. On match, atomically consume the row and write
 * the verified number + timestamp to the user's business via the
 * mark_seller_whatsapp_verified RPC.
 *
 * Unlike verifyPhoneOtpAction, this:
 *   * filters the lookup by purpose='seller_whatsapp' (uses the
 *     phone_verifications_user_purpose_unconsumed_idx partial index)
 *   * re-derives the hash against the row's OWN phone column (the target
 *     number stored at send time), NOT profile.phone
 *   * does NOT consult profile.verification_status (no shortcut)
 *   * calls mark_seller_whatsapp_verified, NOT mark_phone_verified
 *   * does NOT dispatch a welcome email
 */
export async function verifySellerPhoneOtpAction(
  _prev: SellerOtpVerifyState | null,
  formData: FormData,
): Promise<SellerOtpVerifyState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return { error: "Enter the 6-digit code." };
  }

  const admin = createAdminClient();
  const salt = getSalt();

  // Newest unconsumed seller-whatsapp row for this user.
  // Hits phone_verifications_user_purpose_unconsumed_idx (partial on
  // consumed_at IS NULL).
  const { data: row } = await admin
    .from("phone_verifications")
    .select("id, phone, code_hash, expires_at, attempts_made")
    .eq("user_id", user.id)
    .eq("purpose", "seller_whatsapp")
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

  // Re-derive the hash using the ROW'S OWN phone (the target number stamped
  // at send time), not profile.phone. This is the structural guarantee that
  // only the OTP delivered to row.phone can satisfy this check.
  const submittedHash = await sha256Hex(`${salt}:${row.phone}:${code}`);
  if (submittedHash !== row.code_hash) {
    await admin
      .from("phone_verifications")
      .update({ attempts_made: row.attempts_made + 1 })
      .eq("id", row.id);
    return { error: "Incorrect code. Please try again." };
  }

  // Match — atomic consume + write to businesses via the sibling SECURITY
  // DEFINER RPC. The RPC reads v_row.phone (provably-verified number) and
  // writes it to businesses.seller_whatsapp + sets seller_whatsapp_verified_at.
  // It does NOT touch profiles.* (the whole point vs. mark_phone_verified).
  //
  // Returns false in two cases the action can't distinguish:
  //   (a) the OTP row was concurrently consumed (benign race), OR
  //   (b) the user has no business row yet (Stage C orchestration must
  //       ensure becomeSellerAction creates the business before this runs).
  const { data: ok, error: rpcErr } = await admin.rpc(
    "mark_seller_whatsapp_verified",
    {
      p_verification_id: row.id,
      p_user_id: user.id,
    },
  );
  if (rpcErr) {
    console.error("mark_seller_whatsapp_verified rpc failed", rpcErr.message);
    return { error: "Could not complete verification. Please try again." };
  }
  if (ok === true) {
    return { ok: true };
  }
  return {
    error:
      "Could not complete verification. If you haven't created your seller account yet, finish that step first.",
  };
}
