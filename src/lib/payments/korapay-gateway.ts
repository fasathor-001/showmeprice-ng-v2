// KorapayGateway — D-078 documented fallback for payments. NOT a Phase E
// active path; scaffolded as a placeholder so the abstraction has a real
// second implementation slot to test against.
//
// Phase E primary use of Korapay is the Identity service (NIN verification)
// via the separate NinVerifier interface in src/lib/identity. Korapay
// payment integration is not on the Phase E roadmap.
//
// Phase F+ may implement this class if Paystack reliability becomes
// insufficient, or if a Korapay-specific payment feature is needed.

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

export interface KorapayGatewayConfig {
  secretKey: string;
  publicKey: string;
  apiBaseUrl?: string;
  callbackUrl: string;
}

export class KorapayGateway implements PaymentGateway {
  public readonly vendor = "korapay";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly _config: KorapayGatewayConfig) {
    // Stub.
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  initiateCharge(_request: ChargeRequest): Promise<ChargeInitResult> {
    throw new NotImplementedError("KorapayGateway.initiateCharge");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  verifyCharge(_provider_reference: string): Promise<ChargeVerifyResult> {
    throw new NotImplementedError("KorapayGateway.verifyCharge");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  refund(_request: RefundRequest): Promise<RefundResult> {
    throw new NotImplementedError("KorapayGateway.refund");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createSubscription(_request: SubscriptionCreateRequest): Promise<SubscriptionCreateResult> {
    throw new NotImplementedError("KorapayGateway.createSubscription");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cancelSubscription(_provider_subscription_code: string): Promise<SubscriptionCancelResult> {
    throw new NotImplementedError("KorapayGateway.cancelSubscription");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  verifyWebhookSignature(_rawBody: string, _signature: string): boolean {
    throw new NotImplementedError("KorapayGateway.verifyWebhookSignature");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handleWebhook(_payload: unknown, _signature: string): Promise<WebhookResult> {
    throw new NotImplementedError("KorapayGateway.handleWebhook");
  }
}
