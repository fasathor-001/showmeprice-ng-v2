"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import {
  sendPhoneOtpAction,
  verifyPhoneOtpAction,
  type OtpActionState,
} from "@/app/(auth)/otp-actions";

const initial: OtpActionState = {};
const COOLDOWN_SECONDS = 60;

interface Props {
  phone: string;
  next: string;
}

export function VerifyPhoneForm({ phone, next }: Props) {
  const router = useRouter();
  const [sendState, sendAction] = useFormState(sendPhoneOtpAction, initial);
  const [verifyState, verifyAction] = useFormState(verifyPhoneOtpAction, initial);
  const [cooldown, setCooldown] = useState(0);

  // Start the soft client cooldown each time a send succeeds. (The real cap is
  // the server's 3/hr; this just prevents reflexive resend taps.)
  useEffect(() => {
    if (sendState.ok) setCooldown(COOLDOWN_SECONDS);
  }, [sendState]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // On successful verification, continue to the intended destination + toast.
  useEffect(() => {
    if (verifyState.ok) {
      const sep = next.includes("?") ? "&" : "?";
      router.push(`${next}${sep}toast=phone-verified`);
    }
  }, [verifyState, next, router]);

  const everSent = sendState.ok === true;

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-600 text-center">
        Code will be sent to{" "}
        <span className="font-medium text-ink tabular-nums">{phone}</span>
      </p>

      {/* Send / resend code */}
      <form action={sendAction}>
        <SendButton cooldown={cooldown} everSent={everSent} />
        {sendState.error && (
          <p role="alert" className="text-xs text-danger mt-2 text-center">
            {sendState.error}
          </p>
        )}
      </form>

      {/* Enter + verify code */}
      <form action={verifyAction} noValidate className="space-y-3">
        <div>
          <label
            htmlFor="code"
            className="block text-sm font-medium text-ink mb-1.5"
          >
            6-digit code
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
            error={verifyState.error}
          />
        </div>
        <VerifyButton />
      </form>

      <div className="text-center">
        <Link
          href={next}
          className="text-sm text-ink-600 hover:text-ink underline"
        >
          Skip for now
        </Link>
      </div>
    </div>
  );
}

function SendButton({
  cooldown,
  everSent,
}: {
  cooldown: number;
  everSent: boolean;
}) {
  const { pending } = useFormStatus();
  const label =
    cooldown > 0
      ? `Resend code (${cooldown}s)`
      : everSent
        ? "Resend code"
        : "Send code";
  return (
    <Button
      type="submit"
      variant={everSent ? "ghost" : "primary"}
      size="lg"
      fullWidth
      disabled={pending || cooldown > 0}
    >
      {pending ? "Sending…" : label}
    </Button>
  );
}

function VerifyButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending}>
      {pending ? "Verifying…" : "Verify"}
    </Button>
  );
}
