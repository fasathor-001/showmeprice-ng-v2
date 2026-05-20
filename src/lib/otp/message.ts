// OTP SMS copy — single source of truth. The server action renders the message
// here and passes the finished string to provider.sendOtp (delivery-only).
//
// 119 chars, single SMS segment. Code is cleanly extractable for OS autofill;
// expiry is stated; the "we will never ask" line is a stronger anti-phishing
// test than "never share" against the NG fake-support scam vector (D4).

export function renderOtpMessage(code: string): string {
  return `ShowMePrice: your verification code is ${code}. Expires in 10 minutes. We will never ask for this code by phone or message.`;
}
