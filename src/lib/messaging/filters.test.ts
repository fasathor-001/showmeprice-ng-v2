import { describe, it, expect } from "vitest";
import { matchFilterRules, isLikelyPriceContext } from "./filters";
import type { FilterRule } from "./types";

// Rules mirroring the deployed message-context ruleset (E.2.3.0 / D-110
// Interpretation C). All are already message-context (caller pre-filters);
// matchFilterRules applies the tier filter + block>warn precedence + K-029.
const RULES: FilterRule[] = [
  {
    id: "wa",
    rule_type: "whatsapp_link",
    pattern: "(wa\\.me|api\\.whatsapp\\.com|whatsapp\\.com)",
    action: "block",
    applies_to_context: ["message"],
    applies_to_tier: ["free"],
  },
  {
    id: "tg",
    rule_type: "telegram_link",
    pattern: "(t\\.me|telegram\\.me)",
    action: "block",
    applies_to_context: ["message"],
    applies_to_tier: ["free"],
  },
  {
    id: "sig",
    rule_type: "signal_link",
    pattern: "(signal\\.me|signal\\.org)",
    action: "block",
    applies_to_context: ["message"],
    applies_to_tier: ["free"],
  },
  {
    id: "pay",
    rule_type: "payment_url",
    pattern: "(paystack\\.com/pay|flutterwave\\.com/pay|monnify\\.com/pay)",
    action: "block",
    applies_to_context: ["message"],
    applies_to_tier: ["free", "pro"],
  },
  {
    id: "short",
    rule_type: "shortened_url",
    pattern: "(bit\\.ly|tinyurl\\.com|t\\.co|goo\\.gl|ow\\.ly)",
    action: "block",
    applies_to_context: ["message"],
    applies_to_tier: ["free", "pro"],
  },
  {
    id: "email",
    rule_type: "email",
    pattern: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}",
    action: "warn",
    applies_to_context: ["message"],
    applies_to_tier: ["free"],
  },
  {
    id: "nuban",
    rule_type: "nuban",
    pattern: "\\b\\d{10}\\b",
    action: "warn",
    applies_to_context: ["message"],
    applies_to_tier: ["free"],
  },
  {
    id: "phone",
    rule_type: "phone",
    pattern: "(?:\\+?234|0)(70|80|81|90|91)\\d{8}",
    action: "warn",
    applies_to_context: ["message"],
    applies_to_tier: ["free"],
  },
];

describe("matchFilterRules — block patterns (off-platform handoff)", () => {
  it("blocks a wa.me link for a free user", () => {
    const r = matchFilterRules("ping me on wa.me/2348012345678", "free", RULES);
    expect(r.action).toBe("block");
    expect(r.rule?.rule_type).toBe("whatsapp_link");
  });

  it("blocks a telegram link", () => {
    expect(matchFilterRules("t.me/seller", "free", RULES).action).toBe("block");
  });

  it("blocks a signal link", () => {
    expect(matchFilterRules("signal.me/#x", "free", RULES).action).toBe("block");
  });

  it("blocks a payment URL for BOTH free and pro tiers", () => {
    expect(matchFilterRules("paystack.com/pay/abc", "free", RULES).action).toBe("block");
    expect(matchFilterRules("paystack.com/pay/abc", "pro", RULES).action).toBe("block");
  });

  it("blocks a shortened URL", () => {
    expect(matchFilterRules("see bit.ly/xyz", "free", RULES).action).toBe("block");
  });

  it("block wins over a co-occurring warn", () => {
    const r = matchFilterRules("email me a@b.com then wa.me/234", "free", RULES);
    expect(r.action).toBe("block");
  });
});

describe("matchFilterRules — warn patterns (tier-scoped, Pro-exempt)", () => {
  it("warns on an email for a free user", () => {
    const r = matchFilterRules("reach me at seller@gmail.com", "free", RULES);
    expect(r.action).toBe("warn");
    expect(r.rule?.rule_type).toBe("email");
  });

  it("does NOT warn an email for a pro user (rule is free-only)", () => {
    expect(matchFilterRules("reach me at seller@gmail.com", "pro", RULES).action).toBe("allow");
  });

  it("warns on a bare NG phone number", () => {
    expect(matchFilterRules("call 08012345678", "free", RULES).action).toBe("warn");
  });
});

describe("matchFilterRules — NUBAN K-029 whitelist", () => {
  it("warns on a bare 10-digit account number", () => {
    const r = matchFilterRules("my account is 0123456789", "free", RULES);
    expect(r.action).toBe("warn");
    expect(r.rule?.rule_type).toBe("nuban");
  });

  it("suppresses the nuban warn in price context", () => {
    expect(matchFilterRules("last price is ₦1234567890", "free", RULES).action).toBe("allow");
    expect(matchFilterRules("price 1234567890 naira", "free", RULES).action).toBe("allow");
  });
});

describe("matchFilterRules — allow paths", () => {
  it("allows clean negotiation text", () => {
    expect(matchFilterRules("Is this still available? Can we meet?", "free", RULES).action).toBe("allow");
  });

  it("ignores a rule whose tier doesn't match the sender", () => {
    // email rule is free-only; a pro user sending an email → allow
    expect(matchFilterRules("a@b.com", "pro", RULES).action).toBe("allow");
  });

  it("skips a malformed regex without crashing", () => {
    const bad: FilterRule[] = [
      { id: "bad", rule_type: "x", pattern: "(", action: "block", applies_to_context: ["message"], applies_to_tier: ["free"] },
    ];
    expect(matchFilterRules("anything", "free", bad).action).toBe("allow");
  });
});

describe("isLikelyPriceContext", () => {
  it("detects naira / price markers", () => {
    expect(isLikelyPriceContext("₦5000")).toBe(true);
    expect(isLikelyPriceContext("450k")).toBe(true);
    expect(isLikelyPriceContext("1,200,000")).toBe(true);
    expect(isLikelyPriceContext("last price")).toBe(true);
    expect(isLikelyPriceContext("is it negotiable?")).toBe(true);
  });

  it("does not flag plain text", () => {
    expect(isLikelyPriceContext("my account is 0123456789")).toBe(false);
  });
});
