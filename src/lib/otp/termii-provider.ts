// TermiiProvider — Stage 2.A primary OTP delivery provider.
//
// Uses Termii's generic SMS endpoint (POST /api/sms/send) with channel='dnd'.
// We do NOT use Termii's Token API — we own the OTP lifecycle, so Termii only
// delivers the message we rendered.
//
// 'dnd' route: Termii docs — "Delivers messages to all phone numbers,
// regardless of dnd restriction." Required for transactional OTP traffic;
// 'generic' explicitly excludes DND-registered numbers and would silently drop
// OTPs to a large fraction of NG mobiles.

import type { OtpProvider } from "./otp-provider";
import type { SendOtpRequest, SendOtpResult } from "./types";
import {
  OtpDeliveryError,
  OtpProviderUnreachableError,
  OtpRateLimitedError,
  NotImplementedError,
} from "./types";

export interface TermiiProviderConfig {
  apiKey: string;
  senderId: string;
  /** Override for the API base URL — defaults to https://v3.api.termii.com. */
  apiBaseUrl?: string;
}

const DEFAULT_BASE_URL = "https://v3.api.termii.com";

export class TermiiProvider implements OtpProvider {
  public readonly vendor = "termii";

  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly baseUrl: string;

  constructor(config: TermiiProviderConfig) {
    this.apiKey = config.apiKey;
    this.senderId = config.senderId;
    this.baseUrl = (config.apiBaseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  async sendOtp(request: SendOtpRequest): Promise<SendOtpResult> {
    if (request.channel !== "sms") {
      throw new NotImplementedError(this.vendor, request.channel);
    }

    const url = `${this.baseUrl}/api/sms/send`;
    const body = {
      api_key: this.apiKey,
      to: request.to,
      from: this.senderId,
      sms: request.message,
      type: "plain",
      channel: "dnd",
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new OtpProviderUnreachableError(this.vendor, cause);
    }

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      // Non-JSON body — leave payload null; status handling below decides.
    }

    if (res.status === 429) {
      throw new OtpRateLimitedError(this.vendor, payload);
    }
    if (!res.ok) {
      throw new OtpDeliveryError(
        this.vendor,
        extractMessage(payload) ?? `HTTP ${res.status}`,
        payload,
      );
    }

    // Success shape: { code: "ok", message_id: "...", message: "Successfully Sent" }
    const obj = (payload ?? {}) as Record<string, unknown>;
    const code = typeof obj.code === "string" ? obj.code : undefined;
    const messageId =
      typeof obj.message_id === "string"
        ? obj.message_id
        : typeof obj.message_id_str === "string"
          ? obj.message_id_str
          : undefined;

    if (code !== "ok" || !messageId) {
      throw new OtpDeliveryError(
        this.vendor,
        extractMessage(payload) ?? "unexpected response shape",
        payload,
      );
    }

    return { provider_message_id: messageId, vendor_raw: payload };
  }
}

function extractMessage(payload: unknown): string | undefined {
  if (payload && typeof payload === "object" && "message" in payload) {
    const m = (payload as Record<string, unknown>).message;
    if (typeof m === "string") return m;
  }
  return undefined;
}
