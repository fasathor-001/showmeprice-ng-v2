// Stage 2.B messaging — D-110 safety filter integration (Commit 1).
//
// The filter is HIGH-CONSEQUENCE: a missed `block` leaks contact info
// off-platform (D-110/D-112 violation). Two design choices for safety:
//   1. filter_rules is read via the SERVICE-ROLE admin client (reference data,
//      not party-scoped). The authenticated client + uncertain RLS could fail
//      OPEN (RLS denies SELECT -> empty rules -> nothing blocked). Admin read
//      guarantees the ruleset loads. (Surfaced as a deliberate deviation from
//      "no service-role in Commit 1" — filter_rules is global admin data.)
//   2. runMessageFilter THROWS on infra error so callers fail CLOSED (reject
//      the message) rather than send unfiltered.
//
// matchFilterRules is PURE (no I/O) and is the unit-tested surface (filters.test.ts).

import { createAdminClient } from "@/lib/supabase/admin";
import type { FilterRule, FilterResult } from "./types";

/**
 * K-029: the `nuban` rule (`\b\d{10}\b`) matches any 10-digit run, so prices,
 * order IDs, etc. trigger false positives. Suppress the nuban WARN when the
 * content reads as price/negotiation context. Heuristic — tuned in private beta.
 * Only ever suppresses a WARN (nuban is warn-only in messages per Interp. C),
 * so over-suppression is low-harm.
 */
export function isLikelyPriceContext(content: string): boolean {
  const c = content.toLowerCase();
  return (
    /[₦n]\s?\d/.test(c) || // ₦5000 / N5000
    /\bngn\b/.test(c) ||
    /\d\s?k\b/.test(c) || // 450k
    /\d{1,3}(,\d{3})+/.test(c) || // 1,200,000
    /\bnaira\b/.test(c) ||
    /\blast\s?price\b/.test(c) ||
    /\bnegotiab/.test(c) ||
    /\bprice\b/.test(c) ||
    /\boffer\b/.test(c)
  );
}

/**
 * PURE matcher. Given message content, the sender's tier, and the active
 * message-context rules, return the strongest action (block > warn > allow).
 * Tier filtering happens here; context filtering is assumed done by the caller
 * (all `rules` are already message-context). Bad regexes are skipped (never
 * crash the send path on a malformed admin-entered pattern).
 */
export function matchFilterRules(
  content: string,
  tier: string,
  rules: FilterRule[],
): FilterResult {
  let warnHit: FilterRule | undefined;
  for (const rule of rules) {
    if (!rule.applies_to_tier?.includes(tier)) continue;
    let re: RegExp;
    try {
      re = new RegExp(rule.pattern, "i");
    } catch {
      continue; // malformed pattern — skip, don't crash
    }
    if (!re.test(content)) continue;
    // K-029: suppress nuban warn in price context.
    if (
      rule.rule_type === "nuban" &&
      rule.action === "warn" &&
      isLikelyPriceContext(content)
    ) {
      continue;
    }
    if (rule.action === "block") return { action: "block", rule };
    if (rule.action === "warn" && !warnHit) warnHit = rule;
  }
  return warnHit ? { action: "warn", rule: warnHit } : { action: "allow" };
}

/**
 * Fetch active message-context rules (admin client) and match. THROWS on infra
 * error so callers fail closed. `tier` is the sender's profiles.tier.
 */
export async function runMessageFilter(
  content: string,
  tier: string,
): Promise<FilterResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("filter_rules")
    .select("id, rule_type, pattern, action, applies_to_context, applies_to_tier")
    .eq("active", true)
    .contains("applies_to_context", ["message"]);
  if (error) {
    throw new Error(`filter_rules read failed: ${error.message}`);
  }
  const rules = (data ?? []) as FilterRule[];
  return matchFilterRules(content, tier, rules);
}

/** User-facing reason for a blocked message, by rule type. */
export function blockReason(rule?: FilterRule): string {
  switch (rule?.rule_type) {
    case "whatsapp_link":
    case "telegram_link":
    case "signal_link":
      return "Links to WhatsApp, Telegram, or Signal aren't allowed — keep the conversation on ShowMePrice so there's a record.";
    case "payment_url":
      return "Payment links aren't allowed in messages. ShowMePrice doesn't handle product payments — arrange payment safely after inspection.";
    case "shortened_url":
      return "Shortened links aren't allowed in messages. Please share the full context here instead.";
    default:
      return "This message contains content that isn't allowed. Please reword and try again.";
  }
}

/**
 * Best-effort filter-action log to filter_actions_log (admin client, never
 * blocks the user action). If RLS/insert fails, log to console and continue
 * (K-028 tracks the broader policy-transcription gap).
 */
export async function logFilterAction(params: {
  userId: string;
  messageId: string | null;
  result: FilterResult;
  content: string;
  userProceeded: boolean;
}): Promise<void> {
  if (params.result.action === "allow") return; // nothing noteworthy to log
  try {
    const admin = createAdminClient();
    await admin.from("filter_actions_log").insert({
      user_id: params.userId,
      context: "message",
      context_id: params.messageId,
      rule_id: params.result.rule?.id ?? null,
      rule_action: params.result.action,
      original_content: params.content,
      user_proceeded: params.userProceeded,
    });
  } catch (err) {
    console.error(
      "[logFilterAction] best-effort log failed",
      err instanceof Error ? err.message : String(err),
    );
  }
}
