// Payment gateway module — public surface.
//
// App code imports `getPaymentGateway()` from this file to receive the
// configured implementation. Tests inject a mock satisfying the
// PaymentGateway interface; production reads the vendor from
// PAYMENT_GATEWAY_VENDOR env var (default: 'paystack').

import { PaymentGateway } from "./payment-gateway";
import { PaystackGateway } from "./paystack-gateway";
import { KorapayGateway } from "./korapay-gateway";

export * from "./types";
export * from "./errors";
export type { PaymentGateway } from "./payment-gateway";
export { PaystackGateway } from "./paystack-gateway";
export { KorapayGateway } from "./korapay-gateway";

type SupportedVendor = "paystack" | "korapay";

function readVendor(): SupportedVendor {
  const raw = process.env.PAYMENT_GATEWAY_VENDOR?.toLowerCase() ?? "paystack";
  if (raw === "paystack" || raw === "korapay") return raw;
  throw new Error(
    `Invalid PAYMENT_GATEWAY_VENDOR='${raw}' — must be 'paystack' or 'korapay'`,
  );
}

function readRequired(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

let _instance: PaymentGateway | null = null;

/**
 * Returns the configured PaymentGateway implementation.
 *
 * Phase E: returns a PaystackGateway by default. KorapayGateway can be
 * selected via PAYMENT_GATEWAY_VENDOR=korapay but its methods throw
 * NotImplementedError (D-078: documented fallback target only in Phase E).
 *
 * Instance is memoized per process — both gateway classes are stateless,
 * holding only their config in a closure-private field.
 */
export function getPaymentGateway(): PaymentGateway {
  if (_instance) return _instance;

  const vendor = readVendor();
  const callbackUrl = readRequired("PAYMENT_GATEWAY_CALLBACK_URL");

  if (vendor === "paystack") {
    _instance = new PaystackGateway({
      secretKey: readRequired("PAYSTACK_SECRET_KEY"),
      publicKey: readRequired("PAYSTACK_PUBLIC_KEY"),
      apiBaseUrl: process.env.PAYSTACK_API_BASE_URL,
      callbackUrl,
    });
  } else {
    _instance = new KorapayGateway({
      secretKey: readRequired("KORAPAY_SECRET_KEY"),
      publicKey: readRequired("KORAPAY_PUBLIC_KEY"),
      apiBaseUrl: process.env.KORAPAY_API_BASE_URL,
      callbackUrl,
    });
  }

  return _instance;
}

/**
 * Test-only: reset the memoized instance so a subsequent
 * getPaymentGateway() picks up new env vars. Do NOT call from production
 * code paths — the memoization is intentional.
 */
export function __resetPaymentGatewayInstance(): void {
  _instance = null;
}
