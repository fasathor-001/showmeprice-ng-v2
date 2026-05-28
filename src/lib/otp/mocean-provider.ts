// MoceanProvider — OTP delivery via Mocean's plain Send SMS endpoint.
//
// Uses POST /rest/2/sms with form-encoded body. We do NOT use Mocean's Verify
// API — we own the OTP lifecycle, so Mocean only delivers the message we
// rendered.
//
// Bearer token auth via MOCEAN_API_TOKEN env var. Sender ID from
// MOCEAN_SENDER_ID env var.

import type { OtpProvider } from "./otp-provider";
import type { SendOtpRequest, SendOtpResult } from "./types";
import {
  OtpDeliveryError,
  OtpProviderUnreachableError,
  OtpRateLimitedError,
  NotImplementedError,
} from "./types";

export interface MoceanProviderConfig {
  apiToken: string;
  senderId: string;
  /** Override for the API base URL — defaults to https://rest.moceanapi.com. */
  apiBaseUrl?: string;
}

const DEFAULT_BASE_URL = "https://rest.moceanapi.com";

export class MoceanProvider implements OtpProvider {
  public readonly vendor = "mocean";

  private readonly apiToken: string;
  private readonly senderId: string;
  private readonly baseUrl: string;

  constructor(config: MoceanProviderConfig) {
    this.apiToken = config.apiToken;
    this.senderId = config.senderId;
    this.baseUrl = (config.apiBaseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  async sendOtp(request: SendOtpRequest): Promise<SendOtpResult> {
    if (request.channel !== "sms") {
      throw new NotImplementedError(this.vendor, request.channel);
    }

    const url = `${this.baseUrl}/rest/2/sms`;

    // Form-encoded request body per Mocean SMS API.
    const body = new URLSearchParams({
      "mocean-from": this.senderId,
      "mocean-to": request.to,
      "mocean-text": request.message,
      "mocean-resp-format": "json",
    });

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
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

    // Success shape: { messages: [{ status: 0, msgid: "...", ... }] }
    const obj = (payload ?? {}) as Record<string, unknown>;
    const messages = Array.isArray(obj.messages) ? obj.messages : [];
    const firstMessage = messages[0] as Record<string, unknown> | undefined;

    if (!firstMessage || typeof firstMessage.status !== "number") {
      throw new OtpDeliveryError(
        this.vendor,
        "unexpected response shape",
        payload,
      );
    }

    const status = firstMessage.status;
    const errMsg =
      typeof firstMessage.err_msg === "string" ? firstMessage.err_msg : "";

    // Map Mocean status codes to error scenarios.
    // 0 = success
    // 2 = insufficient balance → delivery error
    // 8 = sender ID issue → delivery error
    // 28 = invalid destination → delivery error
    // 32 = throttled → rate-limited error
    // 44 = sender ID invalid → delivery error
    if (status === 32) {
      throw new OtpRateLimitedError(this.vendor, payload);
    }
    if (status !== 0) {
      const statusDesc = getStatusDescription(status);
      const msg = errMsg
        ? `status ${status} (${statusDesc}): ${errMsg}`
        : `status ${status} (${statusDesc})`;
      throw new OtpDeliveryError(this.vendor, msg, payload);
    }

    const msgid =
      typeof firstMessage.msgid === "string" ? firstMessage.msgid : undefined;
    if (!msgid) {
      throw new OtpDeliveryError(
        this.vendor,
        "no msgid in response",
        payload,
      );
    }

    return { provider_message_id: msgid, vendor_raw: payload };
  }
}

function extractMessage(payload: unknown): string | undefined {
  if (payload && typeof payload === "object" && "message" in payload) {
    const m = (payload as Record<string, unknown>).message;
    if (typeof m === "string") return m;
  }
  return undefined;
}

function getStatusDescription(status: number): string {
  switch (status) {
    case 1:
      return "account error";
    case 2:
      return "insufficient balance";
    case 3:
      return "send out of service";
    case 4:
      return "user not found";
    case 5:
      return "user suspended";
    case 6:
      return "reseller not found";
    case 7:
      return "reseller suspended";
    case 8:
      return "sender ID not found";
    case 9:
      return "sender ID not activated";
    case 10:
      return "spam detected";
    case 11:
      return "invalid dest";
    case 28:
      return "invalid destination number";
    case 32:
      return "throttled";
    case 44:
      return "sender ID invalid";
    default:
      return "unknown error";
  }
}
