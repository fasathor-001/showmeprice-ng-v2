// PaystackGateway — Phase E primary payment provider (D-074).
//
// Stage 3 will fill in the actual Paystack API integration:
//   - POST /transaction/initialize
//   - GET  /transaction/verify/:reference
//   - POST /transaction/refund
//   - POST /subscription
//   - POST /subscription/disable
//   - Webhook signature: HMAC-SHA512 of raw body keyed on PAYSTACK_SECRET_KEY,
//     compared against the x-paystack-signature header.
//
// E.1.7 ships the class skeleton + constructor wiring so app code can
// import getPaymentGateway() today; methods throw NotImplementedError
// until Stage 3 lands. Tests should mock the PaymentGateway interface
// rather than instantiate this class.

import type { PaymentGateway } from "./payment-gateway";
import type {
  ChargeRequest,
  ChargeInitResult,
  ChargeVerifyResult,
  RefundRequest,
  RefundResult,
  SubscriptionCreateRequest,
  SubscriptionCreateResult,
  SubscriptionCancelResult,
  WebhookResult,
} from "./types";
import { NotImplementedError } from "./errors";

export interface PaystackGatewayConfig {
  secretKey: string;
  publicKey: string;
  /** Override for the API base URL — defaults to https://api.paystack.co. */
  apiBaseUrl?: string;
  /**
   * Callback URL Paystack redirects to after the buyer completes the
   * hosted-page flow. Should be one of our /api/payments/callback routes.
   */
  callbackUrl: string;
}

export class PaystackGateway implements PaymentGateway {
  public readonly vendor = "paystack";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly _config: PaystackGatewayConfig) {
    // Config validation deferred to Stage 3. We retain the config in the
    // closure-private field so the implementation has it ready when the
    // methods get filled in.
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  initiateCharge(_request: ChargeRequest): Promise<ChargeInitResult> {
    throw new NotImplementedError("PaystackGateway.initiateCharge");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  verifyCharge(_provider_reference: string): Promise<ChargeVerifyResult> {
    throw new NotImplementedError("PaystackGateway.verifyCharge");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  refund(_request: RefundRequest): Promise<RefundResult> {
    throw new NotImplementedError("PaystackGateway.refund");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createSubscription(_request: SubscriptionCreateRequest): Promise<SubscriptionCreateResult> {
    throw new NotImplementedError("PaystackGateway.createSubscription");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cancelSubscription(_provider_subscription_code: string): Promise<SubscriptionCancelResult> {
    throw new NotImplementedError("PaystackGateway.cancelSubscription");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  verifyWebhookSignature(_rawBody: string, _signature: string): boolean {
    throw new NotImplementedError("PaystackGateway.verifyWebhookSignature");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handleWebhook(_payload: unknown, _signature: string): Promise<WebhookResult> {
    throw new NotImplementedError("PaystackGateway.handleWebhook");
  }
}
