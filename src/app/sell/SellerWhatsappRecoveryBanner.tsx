"use client";

// Stage C follow-up: seller-WhatsApp recovery banner.
//
// Renders on /sell (business management view) when a seller is in the
// degraded post-creation state: business exists with seller_whatsapp_verified_at
// IS NULL (the abandoned/failed different-number OTP path from
// becomeSellerAction). Without this banner the degraded state is a dead-end —
// the seller has no in-app path to complete WhatsApp verification.
//
// Two recovery paths, mirroring becomeSellerAction's two paths:
//   1. Verified path — one-click: calls setSellerWhatsappFromProfileAction,
//      which UPDATEs the business with the user's already-OTP-proven
//      profile phone. No fresh OTP needed.
//   2. Different-number path — inline send-code → enter-code → verify.
//      Reuses Stage B's sendSellerPhoneOtpAction + verifySellerPhoneOtpAction
//      unchanged. mark_seller_whatsapp_verified RPC now succeeds because
//      the business exists (it didn't, at signup time, before the original
//      verify failure — well, actually it did; the original failure was a
//      bad code, not a missing business. Either way, the business existing
//      is the only RPC precondition, and it's satisfied here.).
//
// On success of either path, router.refresh() re-fetches the /sell server
// component, which sees seller_whatsapp_verified_at IS NOT NULL and stops
// rendering this banner.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@/components/ui";
import { setSellerWhatsappFromProfileAction } from "@/app/(auth)/actions";
import {
  sendSellerPhoneOtpAction,
  verifySellerPhoneOtpAction,
} from "@/app/(auth)/seller-otp-actions";
import { formatNigerianPhone, normalizeNigerianWhatsApp } from "@/lib/auth";

interface Props {
  /**
   * The user's already-OTP-verified profile phone (E.164, no '+'). Null when
   * the user has no phone or hasn't completed phone verification yet — in
   * that case the verified-shortcut path is hidden and only the
   * different-number path is offered.
   */
  verifiedPhone: string | null;
}

type Choice = "verified" | "different";

type SendStatus =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "sent"; sentTo: string }
  | { state: "error"; error: string };

type SubmitStatus = "idle" | "submitting" | "error";

const COOLDOWN_SECONDS = 60;

function fmtCountdown(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function SellerWhatsappRecoveryBanner({ verifiedPhone }: Props) {
  const router = useRouter();

  const [choice, setChoice] = useState<Choice>(
    verifiedPhone ? "verified" : "different",
  );
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [differentNumber, setDifferentNumber] = useState("");
  const [sendStatus, setSendStatus] = useState<SendStatus>({ state: "idle" });
  const [cooldown, setCooldown] = useState(0);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Reset any submit error when the user changes the path; they're trying again.
  useEffect(() => {
    setSubmitError(null);
    if (submitStatus !== "submitting") setSubmitStatus("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice]);

  const formattedVerified = verifiedPhone
    ? formatNigerianPhone(verifiedPhone)
    : null;

  // VERIFIED path — one-click confirm. Writes profile.phone into businesses.
  const handleUseVerifiedNumber = async () => {
    if (submitStatus === "submitting") return;
    setSubmitStatus("submitting");
    setSubmitError(null);
    const result = await setSellerWhatsappFromProfileAction(
      null,
      new FormData(),
    );
    if (result.ok) {
      // /sell server component will re-fetch and see verified_at is set —
      // banner unmounts.
      router.refresh();
      return;
    }
    setSubmitStatus("error");
    setSubmitError(result.error ?? "Couldn't update your WhatsApp.");
  };

  // DIFFERENT path — send-code step.
  const handleSendCode = async () => {
    if (sendStatus.state === "sending" || cooldown > 0) return;

    const normalized = normalizeNigerianWhatsApp(differentNumber);
    if (!normalized) {
      setSendStatus({
        state: "error",
        error: "Enter a valid Nigerian mobile number first.",
      });
      return;
    }
    if (verifiedPhone && normalized === verifiedPhone) {
      setSendStatus({
        state: "error",
        error:
          'That\'s your verified profile number — pick "Use my verified number" instead.',
      });
      return;
    }

    setSendStatus({ state: "sending" });
    const fd = new FormData();
    fd.set("phone", normalized);
    const result = await sendSellerPhoneOtpAction(null, fd);
    if (result.ok && result.targetPhone) {
      setSendStatus({ state: "sent", sentTo: result.targetPhone });
      setCooldown(COOLDOWN_SECONDS);
    } else {
      setSendStatus({
        state: "error",
        error: result.error ?? "Couldn't send code. Please try again.",
      });
    }
  };

  // DIFFERENT path — verify-code step. Business already exists (we're on
  // /sell, has-business branch), so mark_seller_whatsapp_verified RPC will
  // succeed on a valid code.
  const handleVerifyCode = async () => {
    if (submitStatus === "submitting") return;
    if (!/^\d{6}$/.test(code)) {
      setSubmitStatus("error");
      setSubmitError("Enter the 6-digit code we sent.");
      return;
    }
    setSubmitStatus("submitting");
    setSubmitError(null);

    const fd = new FormData();
    fd.set("code", code);
    const result = await verifySellerPhoneOtpAction(null, fd);
    if (result.ok) {
      router.refresh();
      return;
    }
    setSubmitStatus("error");
    setSubmitError(result.error ?? "Couldn't verify the code.");
  };

  const codeSentTo =
    sendStatus.state === "sent" ? formatNigerianPhone(sendStatus.sentTo) : null;

  return (
    <Card className="mb-4 bg-warning-bg border-warning/30">
      <h3 className="text-sm font-medium text-warning-text mb-1">
        Verify your WhatsApp number
      </h3>
      <p className="text-xs text-warning-text mb-3">
        Your seller account doesn&apos;t yet have a verified WhatsApp number.
        Buyers can&apos;t reach you on WhatsApp until you complete this step.
      </p>

      {verifiedPhone ? (
        <div className="space-y-2 mb-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="recoveryChoice"
              value="verified"
              checked={choice === "verified"}
              onChange={() => setChoice("verified")}
              className="mt-0.5 w-4 h-4 text-teal-600 border-neutral-300 focus:ring-teal-400"
            />
            <span className="text-sm text-ink">
              Use my verified number:{" "}
              <span className="font-medium tabular-nums">
                {formattedVerified}
              </span>{" "}
              <span className="text-xs text-verified-text">(verified)</span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="recoveryChoice"
              value="different"
              checked={choice === "different"}
              onChange={() => setChoice("different")}
              className="mt-0.5 w-4 h-4 text-teal-600 border-neutral-300 focus:ring-teal-400"
            />
            <span className="text-sm text-ink">
              Use a different WhatsApp number
            </span>
          </label>
        </div>
      ) : (
        <p className="text-xs text-warning-text mb-3">
          We&apos;ll send a 6-digit code by SMS to confirm the number is yours.
        </p>
      )}

      {choice === "verified" && verifiedPhone && (
        <div>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleUseVerifiedNumber}
            disabled={submitStatus === "submitting"}
          >
            {submitStatus === "submitting" ? "Saving…" : "Use this number"}
          </Button>
          {submitError && (
            <p role="alert" className="text-xs text-danger mt-1.5">
              {submitError}
            </p>
          )}
        </div>
      )}

      {choice === "different" && (
        <div className="space-y-3">
          <div>
            <label htmlFor="recovery-different-number" className="sr-only">
              WhatsApp number
            </label>
            <Input
              id="recovery-different-number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={differentNumber}
              onChange={(e) => {
                setDifferentNumber(e.target.value);
                if (sendStatus.state !== "idle") {
                  setSendStatus({ state: "idle" });
                }
              }}
              placeholder="e.g. 08012345678"
            />
            <p className="text-xs text-ink-600 mt-1.5">
              Nigerian mobile, any common format (080…, +234…). We&apos;ll
              send an SMS code to confirm you control it — this number must
              be able to receive SMS.
            </p>
          </div>

          <div>
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={handleSendCode}
              disabled={
                sendStatus.state === "sending" ||
                cooldown > 0 ||
                !differentNumber.trim()
              }
            >
              {sendStatus.state === "sending"
                ? "Sending…"
                : cooldown > 0
                  ? `Resend in ${fmtCountdown(cooldown)}`
                  : sendStatus.state === "sent"
                    ? "Resend code"
                    : "Send code"}
            </Button>
            {sendStatus.state === "error" && (
              <p role="alert" className="text-xs text-danger mt-1.5">
                {sendStatus.error}
              </p>
            )}
            {codeSentTo && (
              <p className="text-xs text-verified-text mt-1.5">
                SMS code sent to{" "}
                <span className="font-medium tabular-nums">{codeSentTo}</span>
              </p>
            )}
            {codeSentTo && verifiedPhone && (
              <p className="text-xs text-ink-600 mt-1.5">
                Didn&apos;t get the code? If this number can&apos;t receive
                SMS, pick &quot;Use my verified number&quot; above instead.
              </p>
            )}
          </div>

          {sendStatus.state === "sent" && (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="recovery-code"
                  className="block text-sm font-medium text-ink mb-1.5"
                >
                  Enter 6-digit code
                </label>
                <Input
                  id="recovery-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                />
              </div>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleVerifyCode}
                disabled={
                  submitStatus === "submitting" || !/^\d{6}$/.test(code)
                }
              >
                {submitStatus === "submitting" ? "Verifying…" : "Verify number"}
              </Button>
              {submitError && (
                <p role="alert" className="text-xs text-danger mt-1.5">
                  {submitError}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
