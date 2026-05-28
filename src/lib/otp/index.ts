// OTP provider module — public surface.
//
// App code imports getOtpProvider() from this file to receive the configured
// implementation. Tests inject a mock satisfying the OtpProvider interface;
// production reads the vendor from OTP_PROVIDER_VENDOR (default 'termii').
//
// We own the OTP lifecycle — these providers are delivery-only. Mirrors the
// src/lib/payments/ factory pattern.

import type { OtpProvider } from "./otp-provider";
import { TermiiProvider } from "./termii-provider";
import { ArkeselProvider } from "./arkesel-provider";
import { MoceanProvider } from "./mocean-provider";

export * from "./types";
export type { OtpProvider } from "./otp-provider";
export { TermiiProvider } from "./termii-provider";
export { ArkeselProvider } from "./arkesel-provider";
export { MoceanProvider } from "./mocean-provider";

type SupportedVendor = "termii" | "arkesel" | "mocean";

function readVendor(): SupportedVendor {
  const raw = process.env.OTP_PROVIDER_VENDOR?.toLowerCase() ?? "termii";
  if (raw === "termii" || raw === "arkesel" || raw === "mocean") return raw;
  throw new Error(
    `Invalid OTP_PROVIDER_VENDOR='${raw}' — must be 'termii', 'arkesel', or 'mocean'`,
  );
}

function readRequired(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

let _instance: OtpProvider | null = null;

/**
 * Returns the configured OtpProvider implementation.
 *
 * Lazy validation: only the ACTIVE vendor's required env vars are read, so you
 * can run Termii without Arkesel keys set (and vice versa). Instance is
 * memoized per process — both provider classes are stateless, holding only
 * their config in private fields.
 */
export function getOtpProvider(): OtpProvider {
  if (_instance) return _instance;

  const vendor = readVendor();

  if (vendor === "termii") {
    _instance = new TermiiProvider({
      apiKey: readRequired("TERMII_API_KEY"),
      senderId: readRequired("TERMII_SENDER_ID"),
      apiBaseUrl: process.env.TERMII_API_BASE_URL,
    });
  } else if (vendor === "arkesel") {
    _instance = new ArkeselProvider({
      apiKey: readRequired("ARKESEL_API_KEY"),
      senderId: readRequired("ARKESEL_SENDER_ID"),
      apiBaseUrl: process.env.ARKESEL_API_BASE_URL,
    });
  } else {
    _instance = new MoceanProvider({
      apiToken: readRequired("MOCEAN_API_TOKEN"),
      senderId: readRequired("MOCEAN_SENDER_ID"),
      apiBaseUrl: process.env.MOCEAN_API_BASE_URL,
    });
  }

  return _instance;
}

/**
 * Test-only: reset the memoized instance so a subsequent getOtpProvider()
 * picks up new env vars. Do NOT call from production code paths — the
 * memoization is intentional.
 */
export function __resetOtpProviderInstance(): void {
  _instance = null;
}
