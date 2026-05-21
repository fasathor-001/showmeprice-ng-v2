"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import { formatNigerianPhone } from "@/lib/auth";
import {
  sendPhoneOtpAction,
  verifyPhoneOtpAction,
  type OtpActionState,
} from "@/app/(auth)/otp-actions";

const initial: OtpActionState = {};
const COOLDOWN_SECONDS = 60;

function fmtCountdown(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

interface Props {
  phone: string;
  next: string;
  /** True when reached from a hard gate (D-103): no Skip, /dashboard escape instead. */
  required?: boolean;
}

export function VerifyPhoneForm({ phone, next, required = false }: Props) {
  const router = useRouter();
  const [sendState, sendAction] = useFormState(sendPhoneOtpAction, initial);
  const [verifyState, verifyAction] = useFormState(verifyPhoneOtpAction, initial);
  // Latch into State 2 on first successful send; stays true even if a later
  // resend errors (so a failed resend doesn't bounce the user back to State 1).
  const [hasSentOnce, setHasSentOnce] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const formattedPhone = formatNigerianPhone(phone);

  useEffect(() => {
    if (sendState.ok) {
      setHasSentOnce(true);
      setCooldown(COOLDOWN_SECONDS);
    }
  }, [sendState]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // On success, continue to the intended destination with a toast.
  useEffect(() => {
    if (verifyState.ok) {
      const sep = next.includes("?") ? "&" : "?";
      router.push(`${next}${sep}toast=phone-verified`);
    }
  }, [verifyState, next, router]);

  // STATE 1 — request a code.
  if (!hasSentOnce) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-ink-600 text-center">
          We&apos;ll text a code to{" "}
          <span className="font-medium text-ink tabular-nums">
            {formattedPhone}
          </span>
        </p>
        <form action={sendAction}>
          <SendButton cooldown={cooldown} resend={false} />
          {sendState.error && (
            <p role="alert" className="text-xs text-danger mt-2 text-center">
              {sendState.error}
            </p>
          )}
        </form>
        <ExitLink next={next} required={required} />
      </div>
    );
  }

  // STATE 2 — enter the code.
  return (
    <div className="space-y-6">
      <p className="text-sm text-center text-verified-text">
        Code sent to{" "}
        <span className="font-medium tabular-nums">{formattedPhone}</span>
      </p>

      <form action={verifyAction} noValidate className="space-y-3">
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
            aria-describedby={verifyState.error ? "code-error" : undefined}
          />
          {verifyState.error && (
            <p
              id="code-error"
              role="alert"
              className="text-xs text-danger mt-1.5"
            >
              {verifyState.error}
            </p>
          )}
        </div>
        <VerifyButton />
      </form>

      <div className="text-center space-y-2">
        <form action={sendAction}>
          <SendButton cooldown={cooldown} resend />
        </form>
        {sendState.error && (
          <p role="alert" className="text-xs text-danger">
            {sendState.error}
          </p>
        )}
      </div>

      <ExitLink next={next} required={required} />
    </div>
  );
}

function SendButton({
  cooldown,
  resend,
}: {
  cooldown: number;
  resend: boolean;
}) {
  const { pending } = useFormStatus();

  if (resend) {
    const label =
      cooldown > 0 ? `Resend in ${fmtCountdown(cooldown)}` : "Resend code";
    return (
      <Button
        type="submit"
        variant="ghost"
        size="md"
        disabled={pending || cooldown > 0}
      >
        {pending ? "Sending…" : label}
      </Button>
    );
  }

  return (
    <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending}>
      {pending ? "Sending…" : "Send code"}
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

function ExitLink({ next, required }: { next: string; required: boolean }) {
  // Required mode: honest escape to /dashboard (Skip would loop back into the
  // gate, K-018). Soft mode: Skip routes to the intended destination.
  const href = required ? "/dashboard" : next;
  const label = required ? "Not ready? Go to dashboard" : "Skip for now";
  return (
    <div className="text-center">
      <Link
        href={href}
        className="text-xs text-ink-400 hover:text-ink-600 underline"
      >
        {label}
      </Link>
    </div>
  );
}
