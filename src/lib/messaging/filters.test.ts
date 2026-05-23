import { describe, it, expect } from "vitest";
import { matchFilterRules, isLikelyPriceContext } from "./filters";
import type { FilterRule } from "./types";

// Rules mirror the deployed message-context ruleset as of E.2.6.0 (D-119 /
// Commit 1.6, applied 2026-05-23). All are already message-context (caller
// pre-filters); matchFilterRules applies the tier filter + block>warn
// precedence + K-029.
//
// Production tier scoping (mixed; documented inline):
//   - BLOCK rules: most are {free,pro} (universal); some pre-D-119 off-platform-
//     link blocks (whatsapp/telegram/signal) are {free} only (Pro relaxation).
//   - WARN rules: {free} (Pro relaxation per E.2.3.0 precedent).
//
// D-119 NUBAN flip: was warn-message ({free}); now block-message ({free}).
// K-029 whitelist guard extended to apply to block-tier (filters.ts).
const RULES: FilterRule[] = [
  // ----- pre-D-119 rules (E.1.5 seed + E.2.3.0 reconciliation) -------------
  {
    id: "wa-base",
    rule_type: "whatsapp_link",
    pattern: "(wa\\.me|api\\.whatsapp\\.com|whatsapp\\.com)",
    action: "block",
    applies_to_context: ["message"],
    applies_to_tier: ["free"],
  },
  {
    id: "tg-base",
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
    id: "pay-base",
    rule_type: "payment_url",
    pattern: "(paystack\\.com/pay|flutterwave\\.com/pay|monnify\\.com/pay)",
    action: "block",
    applies_to_context: ["message"],
    applies_to_tier: ["free", "pro"],
  },
  {
    id: "short-base",
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
    id: "phone-base",
    rule_type: "phone",
    // pre-D-119 concat-only pattern (still in production, kept as
    // defense-in-depth alongside the new phone_ng).
    pattern: "(?:\\+?234|0)(70|80|81|90|91)\\d{8}",
    action: "warn",
    applies_to_context: ["message"],
    applies_to_tier: ["free"],
  },
  {
    id: "social",
    rule_type: "social_handle",
    pattern: "(@\\w+|instagram\\.com/|facebook\\.com/|twitter\\.com/|x\\.com/)",
    action: "warn",
    applies_to_context: ["message"],
    applies_to_tier: ["free"],
  },
  // D-119 — NUBAN flipped from warn-message to block-message (E.2.6.0).
  // K-029 whitelist guard extended to apply to block-tier (filters.ts).
  {
    id: "nuban",
    rule_type: "nuban",
    pattern: "\\b\\d{10}\\b",
    action: "block",
    applies_to_context: ["message"],
    applies_to_tier: ["free"],
  },

  // ----- D-119 new rules (E.2.6.0) ----------------------------------------
  {
    id: "phone-ng",
    rule_type: "phone_ng",
    pattern:
      "(?:(?:\\+?234|0)[\\-\\.\\s]?(?:70|80|81|90|91)[\\-\\.\\s]?\\d[\\-\\.\\s]?\\d{3}[\\-\\.\\s]?\\d{4})",
    action: "block",
    applies_to_context: ["message"],
    applies_to_tier: ["free", "pro"],
  },
  {
    id: "wa-typo",
    rule_type: "whatsapp_link",
    pattern: "(?:we\\.me|w-a\\.me|whatsap\\.me|whatsap\\.com)",
    action: "block",
    applies_to_context: ["message"],
    applies_to_tier: ["free", "pro"],
  },
  {
    id: "pay-extra",
    rule_type: "payment_url",
    pattern:
      "(?:paystack\\.com/pay|flutterwave\\.com|flw\\.co|monnify\\.com|opay\\.com\\.ng|app\\.opay|paypal\\.me)",
    action: "block",
    applies_to_context: ["message"],
    applies_to_tier: ["free", "pro"],
  },
  {
    id: "short-extra",
    rule_type: "shortened_url",
    pattern:
      "(?:bit\\.ly|tinyurl\\.com|t\\.co|cutt\\.ly|rebrand\\.ly|shorturl\\.at|is\\.gd|ow\\.ly)/\\w+",
    action: "block",
    applies_to_context: ["message"],
    applies_to_tier: ["free", "pro"],
  },
  {
    id: "tg-org",
    rule_type: "telegram_link",
    pattern: "telegram\\.org/?",
    action: "block",
    applies_to_context: ["message"],
    applies_to_tier: ["free", "pro"],
  },
  {
    id: "tg-ref",
    rule_type: "telegram_ref",
    pattern:
      "\\b(?:telegram|tele(?:gram)?\\s+(?:id|handle|username|account|name|me|number))\\b",
    action: "block",
    applies_to_context: ["message"],
    applies_to_tier: ["free", "pro"],
  },
  {
    id: "off-platform-a",
    rule_type: "off_platform_handoff",
    pattern:
      "\\b(?:meet|come|see|find|contact|reach|call|text|dm|message)\\s+(?:me|us)\\s+(?:on|at|in|via|outside)\\s+(?:whatsapp|telegram|signal|insta(?:gram)?|ig|fb|facebook|tiktok|snapchat)\\b",
    action: "warn",
    applies_to_context: ["message"],
    applies_to_tier: ["free"],
  },
  {
    id: "off-platform-b",
    rule_type: "off_platform_handoff",
    pattern:
      "\\b(?:continue|chat|talk|lets\\s+talk|let\\s+us\\s+talk)\\s+(?:on|outside|privately|elsewhere)\\b",
    action: "warn",
    applies_to_context: ["message"],
    applies_to_tier: ["free"],
  },
  {
    id: "bank-ref",
    rule_type: "bank_platform_ref",
    pattern:
      "\\b(?:gtbank|gtb|first\\s*bank|fbn|access\\s*bank|zenith|uba|moniepoint|opay|palmpay|kuda|carbon)\\b",
    action: "warn",
    applies_to_context: ["message"],
    applies_to_tier: ["free"],
  },
];

// ============================================================================
// Pre-D-119 baseline (updated for D-119 flips where behavior changed)
// ============================================================================

describe("matchFilterRules — pre-D-119 baseline (block patterns)", () => {
  it("blocks a wa.me link for a free user", () => {
    const r = matchFilterRules("ping me on wa.me/2348012345678", "free", RULES);
    expect(r.action).toBe("block");
    expect(r.rule?.rule_type).toBe("whatsapp_link");
  });

  it("blocks t.me for free user (pre-D-119 telegram_link)", () => {
    expect(matchFilterRules("t.me/seller", "free", RULES).action).toBe("block");
  });

  it("blocks a signal link", () => {
    expect(matchFilterRules("signal.me/#x", "free", RULES).action).toBe("block");
  });

  it("blocks a paystack.com/pay link for BOTH free and pro tiers", () => {
    expect(matchFilterRules("paystack.com/pay/abc", "free", RULES).action).toBe(
      "block",
    );
    expect(matchFilterRules("paystack.com/pay/abc", "pro", RULES).action).toBe(
      "block",
    );
  });

  it("blocks a bit.ly link", () => {
    expect(matchFilterRules("see bit.ly/xyz", "free", RULES).action).toBe(
      "block",
    );
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
    expect(matchFilterRules("reach me at seller@gmail.com", "pro", RULES).action).toBe(
      "allow",
    );
  });
});

describe("matchFilterRules — allow paths", () => {
  it("allows clean negotiation text", () => {
    expect(
      matchFilterRules("Is this still available? Can we meet?", "free", RULES).action,
    ).toBe("allow");
  });

  it("ignores a rule whose tier doesn't match the sender", () => {
    // email rule is free-only; a pro user sending an email → allow.
    expect(matchFilterRules("a@b.com", "pro", RULES).action).toBe("allow");
  });

  it("skips a malformed regex without crashing", () => {
    const bad: FilterRule[] = [
      {
        id: "bad",
        rule_type: "x",
        pattern: "(",
        action: "block",
        applies_to_context: ["message"],
        applies_to_tier: ["free"],
      },
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

// ============================================================================
// D-119 — Nigerian phone format variants (phone_ng block)
// ============================================================================

describe("D-119: phone_ng — Nigerian phone format variants (block)", () => {
  it("blocks +234 concat format", () => {
    const r = matchFilterRules("call +2348012345678", "free", RULES);
    expect(r.action).toBe("block");
    expect(r.rule?.rule_type).toBe("phone_ng");
  });

  it("blocks +234 with spaces", () => {
    expect(matchFilterRules("call +234 801 234 5678", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks +234 with dashes", () => {
    expect(matchFilterRules("call +234-801-234-5678", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks +234 with dots", () => {
    expect(matchFilterRules("call +234.801.234.5678", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks 234 prefix without plus", () => {
    expect(matchFilterRules("ring 2348012345678", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks 0-prefix concat (any carrier 070/080/081/090/091)", () => {
    expect(matchFilterRules("call 08012345678", "free", RULES).action).toBe(
      "block",
    );
    expect(matchFilterRules("call 09012345678", "free", RULES).action).toBe(
      "block",
    );
    expect(matchFilterRules("call 07012345678", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks 0-prefix with spaces", () => {
    expect(matchFilterRules("call 080 1234 5678", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks 0-prefix with dashes (4-3-4 split)", () => {
    // Pattern allows 1-3-4 digit groups with optional separators between
    // groups. "080-1234-5678" is the realistic dashed form (carrier + 4 + 4).
    expect(matchFilterRules("call 080-1234-5678", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks phone for Pro tier too (D-119 universal block)", () => {
    const r = matchFilterRules("+2348012345678", "pro", RULES);
    expect(r.action).toBe("block");
    expect(r.rule?.rule_type).toBe("phone_ng");
  });
});

// ============================================================================
// D-119 — WhatsApp typo variants (whatsapp_link block extension)
// ============================================================================

describe("D-119: whatsapp_link — typo variants (block)", () => {
  it("blocks we.me", () => {
    expect(matchFilterRules("ping me on we.me/2348012345678", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks w-a.me", () => {
    expect(matchFilterRules("see w-a.me/seller", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks whatsap.me typo", () => {
    expect(matchFilterRules("ping whatsap.me/seller", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks whatsap.com typo", () => {
    expect(matchFilterRules("see whatsap.com/seller", "free", RULES).action).toBe(
      "block",
    );
  });
});

// ============================================================================
// D-119 — Payment platform links (payment_url block extension)
// ============================================================================

describe("D-119: payment_url — additional platforms (block)", () => {
  it("blocks paystack.com/pay (universal — pre-existing)", () => {
    expect(matchFilterRules("paystack.com/pay/abc", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks flutterwave.com (without /pay)", () => {
    expect(matchFilterRules("pay via flutterwave.com/xyz", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks flw.co shortener", () => {
    expect(matchFilterRules("flw.co/abc", "free", RULES).action).toBe("block");
  });

  it("blocks monnify.com", () => {
    expect(matchFilterRules("pay monnify.com/x", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks paypal.me", () => {
    expect(matchFilterRules("send via paypal.me/john", "free", RULES).action).toBe(
      "block",
    );
  });
});

// ============================================================================
// D-119 — Shortened URLs (shortened_url block extension)
// ============================================================================

describe("D-119: shortened_url — additional shorteners (block)", () => {
  it("blocks bit.ly (pre-existing)", () => {
    expect(matchFilterRules("see bit.ly/xyz", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks cutt.ly", () => {
    expect(matchFilterRules("see cutt.ly/abc", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks rebrand.ly", () => {
    expect(matchFilterRules("see rebrand.ly/foo", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks shorturl.at", () => {
    expect(matchFilterRules("see shorturl.at/bar", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks is.gd", () => {
    expect(matchFilterRules("is.gd/baz", "free", RULES).action).toBe("block");
  });
});

// ============================================================================
// D-119 — Telegram references (telegram_link + telegram_ref)
// ============================================================================

describe("D-119: telegram — link + textual references (block)", () => {
  it("blocks telegram.org URL", () => {
    expect(matchFilterRules("see telegram.org/", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks 'telegram id' textual reference", () => {
    const r = matchFilterRules("my telegram id is xyz", "free", RULES);
    expect(r.action).toBe("block");
    expect(r.rule?.rule_type).toBe("telegram_ref");
  });

  it("blocks 'telegram handle' textual reference", () => {
    expect(matchFilterRules("dm my telegram handle", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks 'telegram username' textual reference", () => {
    expect(matchFilterRules("telegram username @x", "free", RULES).action).toBe(
      "block",
    );
  });

  it("blocks 'telegram me' textual reference", () => {
    expect(matchFilterRules("telegram me directly", "free", RULES).action).toBe(
      "block",
    );
  });
});

// ============================================================================
// D-119 — Off-platform handoff language (warn x2)
// ============================================================================

describe("D-119: off_platform_handoff — handoff language (warn)", () => {
  it("warns on 'contact me on whatsapp' phrase", () => {
    const r = matchFilterRules("contact me on whatsapp later", "free", RULES);
    expect(r.action).toBe("warn");
    expect(r.rule?.rule_type).toBe("off_platform_handoff");
  });

  it("warns on 'message me on instagram'", () => {
    expect(
      matchFilterRules("just message me on instagram", "free", RULES).action,
    ).toBe("warn");
  });

  it("warns on 'lets talk privately'", () => {
    expect(matchFilterRules("lets talk privately", "free", RULES).action).toBe(
      "warn",
    );
  });

  it("warns on 'let us talk outside'", () => {
    expect(matchFilterRules("let us talk outside", "free", RULES).action).toBe(
      "warn",
    );
  });

  it("does NOT warn Pro users (free-only tier)", () => {
    expect(
      matchFilterRules("contact me on whatsapp later", "pro", RULES).action,
    ).toBe("allow");
  });
});

// ============================================================================
// D-119 — Bank platform references (bank_platform_ref warn)
// ============================================================================

describe("D-119: bank_platform_ref — Nigerian bank names (warn)", () => {
  it("warns on 'gtbank' reference", () => {
    const r = matchFilterRules("send to gtbank account", "free", RULES);
    expect(r.action).toBe("warn");
    expect(r.rule?.rule_type).toBe("bank_platform_ref");
  });

  it("warns on 'moniepoint'", () => {
    expect(matchFilterRules("via moniepoint", "free", RULES).action).toBe(
      "warn",
    );
  });

  it("warns on 'kuda'", () => {
    expect(matchFilterRules("use kuda transfer", "free", RULES).action).toBe(
      "warn",
    );
  });
});

// ============================================================================
// D-119 — NUBAN flipped to BLOCK + K-029 whitelist preservation under block
// ============================================================================

describe("D-119: NUBAN — block in messages + K-029 whitelist (still applies)", () => {
  it("blocks a bare 10-digit account number (was warn pre-D-119)", () => {
    const r = matchFilterRules("my account is 0123456789", "free", RULES);
    expect(r.action).toBe("block");
    expect(r.rule?.rule_type).toBe("nuban");
  });

  it("K-029 whitelist: suppresses nuban-block in price context (₦ prefix)", () => {
    expect(matchFilterRules("last price is ₦1234567890", "free", RULES).action).toBe(
      "allow",
    );
  });

  it("K-029 whitelist: suppresses on 'price ... naira' phrase", () => {
    expect(matchFilterRules("price 1234567890 naira", "free", RULES).action).toBe(
      "allow",
    );
  });

  it("K-029 whitelist: suppresses on comma-formatted ₦1B+", () => {
    expect(
      matchFilterRules("the price is 1,234,567,890 today", "free", RULES).action,
    ).toBe("allow");
  });

  it("K-029 whitelist: does NOT suppress when no price markers (block fires)", () => {
    // No ₦/naira/k/price/offer/negotiable/comma-format anywhere → no suppression.
    const r = matchFilterRules("send to 1234567890 now", "free", RULES);
    expect(r.action).toBe("block");
    expect(r.rule?.rule_type).toBe("nuban");
  });
});

// ============================================================================
// D-119 — Mixed-content precedence + clean-message control
// ============================================================================

describe("D-119: mixed content + precedence", () => {
  it("block wins when phone_ng + nuban + email warn co-occur", () => {
    const r = matchFilterRules(
      "call 08012345678 acct 0123456789 mail me a@b.com",
      "free",
      RULES,
    );
    expect(r.action).toBe("block");
  });

  it("clean greeting still allowed (no rules fire)", () => {
    expect(
      matchFilterRules("Hi, is this still available?", "free", RULES).action,
    ).toBe("allow");
  });

  it("legitimate price-only message allowed", () => {
    expect(
      matchFilterRules("last price is ₦450,000 — negotiable", "free", RULES).action,
    ).toBe("allow");
  });
});

// ============================================================================
// K-033 Phase 2 — placeholders for number-as-words / obfuscation
// (skipped; will be implemented when the normalization pipeline lands)
// ============================================================================

describe("K-033 Phase 2 — number-as-words obfuscation (placeholders)", () => {
  it.skip("blocks 'zero eight zero two ...' digit-as-words phone", () => {
    // Pending K-033: normalize "zero eight zero two three four..." → "08023456..."
    // before regex matching. Currently passes the filter unchanged.
    expect(
      matchFilterRules("call zero eight zero two three four five", "free", RULES).action,
    ).toBe("block");
  });

  it.skip("blocks Cyrillic lookalike substitution (е/о/а replace e/o/a)", () => {
    // Pending K-033: Unicode NFKC + lookalike fold to ASCII before matching.
    // e.g. "wа.me" with Cyrillic а should still match wa.me.
    expect(
      matchFilterRules("ping wа.me/seller", "free", RULES).action,
    ).toBe("block");
  });

  it.skip("blocks numbers-with-emoji-spacers obfuscation", () => {
    // Pending K-033: strip non-alphanumeric noise between digits before match.
    expect(
      matchFilterRules("call 080🌟123🌟4567🌟8", "free", RULES).action,
    ).toBe("block");
  });
});
