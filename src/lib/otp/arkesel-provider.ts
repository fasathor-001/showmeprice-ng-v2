// ArkeselProvider — Stage 2.A fallback OTP delivery provider.
//
// Uses Arkesel's bulk SMS endpoint (POST /api/v2/sms/send) with the api-key
// header. We do NOT use Arkesel's dedicated OTP product (/api/otp/generate) —
// we own the OTP lifecycle, so Arkesel only delivers the rendered message.
//
// DEFENSIVE PARSING: Arkesel's API reference is a JS-rendered SPA that couldn't
// be fetched during Stage 2.A design, so the success-response shape below is a
// training-assumed best guess ({ status, data: [{ id, recipient }] }). The
// parser tolerates data-as-array and data-as-object plus several id key
// locations. Frank validates the LIVE shape on the OTP_PROVIDER_VENDOR swap
// before final commit; if it differs, this parser is patched then.

import type { OtpProvider } from "./otp-provider";
import type { SendOtpRequest, SendOtpResult } from "./types";
import {
  OtpDeliveryError,
  OtpProviderUnreachableError,
  OtpRateLimitedError,
  NotImplementedError,
} from "./types";

export interface ArkeselProviderConfig {
  apiKey: string;
  senderId: string;
  /** Override for the API base URL — defaults to https://sms.arkesel.com. */
  apiBaseUrl?: string;
}

const DEFAULT_BASE_URL = "https://sms.arkesel.com";

export class ArkeselProvider implements OtpProvider {
  public readonly vendor = "arkesel";

  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly baseUrl: string;

  constructor(config: ArkeselProviderConfig) {
    this.apiKey = config.apiKey;
    this.senderId = config.senderId;
    this.baseUrl = (config.apiBaseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  async sendOtp(request: SendOtpRequest): Promise<SendOtpResult> {
    if (request.channel !== "sms") {
      throw new NotImplementedError(this.vendor, request.channel);
    }

    const url = `${this.baseUrl}/api/v2/sms/send`;
    const body = {
      sender: this.senderId,
      message: request.message,
      recipients: [request.to],
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": this.apiKey,
        },
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

    const obj = (payload ?? {}) as Record<string, unknown>;
    const status = typeof obj.status === "string" ? obj.status.toLowerCase() : undefined;
    if (status && status !== "success" && status !== "ok") {
      throw new OtpDeliveryError(
        this.vendor,
        extractMessage(payload) ?? `status='${status}'`,
        payload,
      );
    }

    const messageId = extractArkeselMessageId(obj);
    if (!messageId) {
      throw new OtpDeliveryError(
        this.vendor,
        "could not locate message id in response",
        payload,
      );
    }

    return { provider_message_id: messageId, vendor_raw: payload };
  }
}

/**
 * Tolerant message-id extractor for Arkesel's (unconfirmed) response shape.
 * Checks: data[].id, data[].message_id, data.id, data.message_id, then
 * top-level id / message_id.
 */
function extractArkeselMessageId(obj: Record<string, unknown>): string | undefined {
  const data = obj.data;

  if (Array.isArray(data) && data.length > 0) {
    const first = data[0] as Record<string, unknown>;
    if (typeof first.id === "string") return first.id;
    if (typeof first.message_id === "string") return first.message_id;
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    if (typeof d.id === "string") return d.id;
    if (typeof d.message_id === "string") return d.message_id;
  }

  if (typeof obj.id === "string") return obj.id;
  if (typeof obj.message_id === "string") return obj.message_id;

  return undefined;
}

function extractMessage(payload: unknown): string | undefined {
  if (payload && typeof payload === "object" && "message" in payload) {
    const m = (payload as Record<string, unknown>).message;
    if (typeof m === "string") return m;
  }
  return undefined;
}
