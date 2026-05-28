"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@/components/ui";
import { becomeSellerAction } from "@/app/(auth)/actions";
import { sendSellerPhoneOtpAction } from "@/app/(auth)/seller-otp-actions";
import { formatNigerianPhone, normalizeNigerianWhatsApp } from "@/lib/auth";

interface State {
  id: string;
  name: string;
}

interface Props {
  states: State[];
  /**
   * The user's already-OTP-verified profile phone (E.164, no '+'). Null when
   * the user has no phone or hasn't completed phone verification yet — in that
   * case the form hides the "Use my verified number" option and forces the
   * different-number path.
   */
  verifiedPhone: string | null;
}

type WhatsappChoice = "verified" | "different";

type SendCodeStatus =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "sent"; sentTo: string }
  | { state: "error"; error: string };

const initial = { errors: {} };
const COOLDOWN_SECONDS = 60;

function fmtCountdown(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function BecomeSellerForm({ states, verifiedPhone }: Props) {
  const [state, formAction] = useFormState(becomeSellerAction, initial);

  // Default to "verified" when verifiedPhone exists; otherwise force "different".
  const [whatsappChoice, setWhatsappChoice] = useState<WhatsappChoice>(
    verifiedPhone ? "verified" : "different"
  );
  // Different-number target. Controlled so we can pass to sendSellerPhoneOtpAction.
  const [differentNumber, setDifferentNumber] = useState("");
  // Send-code lifecycle for the different-number path.
  const [sendStatus, setSendStatus] = useState<SendCodeStatus>({
    state: "idle",
  });
  // 60-second cooldown after a successful send (mirrors /verify-phone pattern).
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const formattedVerified = verifiedPhone
    ? formatNigerianPhone(verifiedPhone)
    : null;

  // The hidden sellerWhatsapp value submitted with the form. For the verified
  // path this is the user's profile phone (verified-state authority lives on
  // the server — becomeSellerAction re-confirms equality before trusting the
  // "verified" choice). For different-number it's the user-typed value
  // (normalized on the server before validation/storage).
  const hiddenSellerWhatsapp =
    whatsappChoice === "verified" ? verifiedPhone ?? "" : differentNumber;

  const handleSendCode = async () => {
    if (sendStatus.state === "sending") return;
    if (cooldown > 0) return;

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

  const codeSentTo =
    sendStatus.state === "sent" ? formatNigerianPhone(sendStatus.sentTo) : null;

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state?.errors?._form && (
        <div
          role="alert"
          className="bg-danger-bg border border-danger/30 text-danger-text text-sm px-3 py-2.5 rounded-lg"
        >
          {state?.errors._form}
        </div>
      )}

      <div>
        <label
          htmlFor="businessName"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Business name
        </label>
        <Input
          id="businessName"
          name="businessName"
          type="text"
          required
          error={state?.errors?.businessName}
          placeholder="e.g. Lagos Phone Hub"
        />
      </div>

      <div>
        <label
          htmlFor="businessDescription"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          What do you sell?
        </label>
        <textarea
          id="businessDescription"
          name="businessDescription"
          required
          rows={4}
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink placeholder:text-neutral-400 px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400 focus:ring-offset-1"
          placeholder="Briefly describe your business — what you sell, where you're based, anything that helps buyers trust you."
        />
        {state?.errors?.businessDescription && (
          <p className="text-xs text-danger mt-1.5">
            {state?.errors.businessDescription}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="stateId"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Primary state
        </label>
        <select
          id="stateId"
          name="stateId"
          required
          defaultValue=""
          className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400 focus:ring-offset-1"
        >
          <option value="" disabled>
            Choose a state
          </option>
          {states.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {state?.errors?.stateId && (
          <p className="text-xs text-danger mt-1.5">{state?.errors.stateId}</p>
        )}
      </div>

      {/* Stage C: city/area is REQUIRED (trust signal — buyers see the area
          of the seller they're contacting; an unspecified area is a friction
          signal). Banked alongside this stage. Same pattern as the
          listing-level required validateCityArea(). */}
      <div>
        <label
          htmlFor="cityArea"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          City / Area
        </label>
        <Input
          id="cityArea"
          name="cityArea"
          type="text"
          required
          error={state?.errors?.cityArea}
          placeholder="e.g. Ikeja, Computer Village"
        />
        <p className="text-xs text-ink-600 mt-1.5">
          Where your business operates from
        </p>
      </div>

      {/* Stage C: WhatsApp number buyers can contact. Two paths:
            verified  — reuse the already-OTP-proven profile phone (no extra OTP)
            different — typed-in number, must be OTP-verified inline before submit
          D-131 hard rule: no unverified WhatsApp number may ever be revealable
          to buyers. The server (becomeSellerAction + mark_seller_whatsapp_verified)
          owns the verified-state authority — this UI is an affordance. */}
      <div className="border-t border-neutral-200 pt-4">
        <fieldset>
          <legend className="block text-sm font-medium text-ink mb-1.5">
            WhatsApp number buyers can contact
          </legend>
          <p className="text-xs text-ink-600 mb-3">
            Buyers may see this number when they reveal your contact.
          </p>

          {verifiedPhone ? (
            <div className="space-y-2 mb-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="whatsappChoiceRadio"
                  value="verified"
                  checked={whatsappChoice === "verified"}
                  onChange={() => setWhatsappChoice("verified")}
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
                  name="whatsappChoiceRadio"
                  value="different"
                  checked={whatsappChoice === "different"}
                  onChange={() => setWhatsappChoice("different")}
                  className="mt-0.5 w-4 h-4 text-teal-600 border-neutral-300 focus:ring-teal-400"
                />
                <span className="text-sm text-ink">
                  Use a different WhatsApp number
                </span>
              </label>
            </div>
          ) : (
            <p className="text-xs text-ink-600 mb-3">
              We&apos;ll send a 6-digit code by SMS to confirm the number is
              yours.
            </p>
          )}

          {whatsappChoice === "different" && (
            <div className="space-y-3 mt-3">
              <div>
                <label htmlFor="differentNumber" className="sr-only">
                  WhatsApp number
                </label>
                <Input
                  id="differentNumber"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  value={differentNumber}
                  onChange={(e) => {
                    setDifferentNumber(e.target.value);
                    // Reset send status if the user changes the number after sending.
                    if (sendStatus.state !== "idle") {
                      setSendStatus({ state: "idle" });
                    }
                  }}
                  error={state?.errors?.sellerWhatsapp}
                  placeholder="e.g. 08012345678"
                />
                <p className="text-xs text-ink-600 mt-1.5">
                  Nigerian mobile, any common format (080…, +234…). We&apos;ll
                  send an SMS code to confirm you control it — this number
                  must be able to receive SMS.
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
                    <span className="font-medium tabular-nums">
                      {codeSentTo}
                    </span>
                  </p>
                )}
                {codeSentTo && verifiedPhone && (
                  <p className="text-xs text-ink-600 mt-1.5">
                    Didn&apos;t get the code? If this number can&apos;t
                    receive SMS, pick &quot;Use my verified number&quot;
                    above instead.
                  </p>
                )}
              </div>

              {sendStatus.state === "sent" && (
                <div>
                  <label
                    htmlFor="code"
                    className="block text-sm font-medium text-ink mb-1.5"
                  >
                    Enter 6-digit code
                  </label>
                  <Input
                    id="code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    error={state?.errors?.code}
                    placeholder="123456"
                  />
                </div>
              )}
            </div>
          )}

          {/* Hidden inputs the server action reads. whatsappChoice is the
              path discriminator; sellerWhatsapp is the chosen target number
              (server-validated for equality with profile.phone on the
              verified path before any trust is granted). */}
          <input
            type="hidden"
            name="whatsappChoice"
            value={whatsappChoice}
          />
          <input
            type="hidden"
            name="sellerWhatsapp"
            value={hiddenSellerWhatsapp}
          />
        </fieldset>
      </div>

      <SubmitButton whatsappChoice={whatsappChoice} />
    </form>
  );
}

function SubmitButton({ whatsappChoice }: { whatsappChoice: WhatsappChoice }) {
  const { pending } = useFormStatus();
  const label =
    whatsappChoice === "different" ? "Verify & create seller account" : "Create seller account";
  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      fullWidth
      disabled={pending}
    >
      {pending ? "Creating account…" : label}
    </Button>
  );
}
