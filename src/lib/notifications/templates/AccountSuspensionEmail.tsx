// Feature J.5 — transactional email template for "account suspended /
// restored" notifications. Sent to the affected user after an admin
// invokes admin_suspend_user or admin_unsuspend_user (E.2.20.0).
// Generic over `eventType` so a single dispatcher + template pair
// covers both directions (mirrors the AdminProfileChangeEmail pattern
// that handles phone/location with one template).
//
// Visual envelope mirrors AdminProfileChangeEmail.tsx (E.2.16.0
// Step 3) — same containerStyle / brandStyle / hrStyle /
// footerTextStyle so the whole transactional surface stays consistent.
//
// Locked copy (Stage J.5 directive):
//   - Position B: suspension reason is NOT rendered.
//   - Q5: no `/suspended` link, no app URL CTA. Symmetric across both
//     variants for consistency.
//   - Support address: support@showmeprice.ng (Commit 1 of J.5 landed
//     the user-facing support email correction repo-wide).
//
// Tone (per D-124): calm, factual, no exclamation marks. Closes with
// the support address as the recovery path. The unsuspension variant
// reassures briefly; the suspension variant explains what is now
// unavailable.

import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type AccountSuspensionEventType = "suspended" | "unsuspended";

interface AccountSuspensionEmailProps {
  /** Affected user's display name; falls back to "Hello,". */
  userName: string | null;
  /** Which event triggered this email. */
  eventType: AccountSuspensionEventType;
}

const PREVIEW_BY_EVENT: Record<AccountSuspensionEventType, string> = {
  suspended: "Your ShowMePrice account has been suspended",
  unsuspended: "Your ShowMePrice account has been restored",
};

const HEADLINE_BY_EVENT: Record<AccountSuspensionEventType, string> = {
  suspended: "Your account has been suspended",
  unsuspended: "Your account has been restored",
};

export function AccountSuspensionEmail({
  userName,
  eventType,
}: AccountSuspensionEmailProps) {
  const greeting = userName ? `Hello ${userName},` : "Hello,";
  const preview = PREVIEW_BY_EVENT[eventType];
  const headline = HEADLINE_BY_EVENT[eventType];

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* 1. Logo header */}
          <Section style={{ paddingBottom: 24 }}>
            <Text style={brandStyle}>
              ShowMePrice<span style={{ color: "#0d9488" }}>.ng</span>
            </Text>
          </Section>

          {/* 2. Headline */}
          <Section style={{ paddingBottom: 8 }}>
            <Text style={headlineStyle}>{headline}</Text>
          </Section>

          {/* 3. Body copy — locked per J.5 directive. Greeting + status
              sentence + what-it-means sentence + support CTA. No
              suspension reason (Position B). No /suspended link (Q5). */}
          <Section style={{ paddingBottom: 16 }}>
            <Text style={bodyTextStyle}>{greeting}</Text>
            {eventType === "suspended" ? (
              <>
                <Text style={bodyTextStyle}>
                  Your ShowMePrice account has been suspended.
                </Text>
                <Text style={bodyTextStyle}>
                  While suspended, you cannot use seller, messaging, or
                  account features.
                </Text>
                <Text style={bodyTextStyle}>
                  If you believe this is a mistake, please email our support
                  team at{" "}
                  <Link
                    href="mailto:support@showmeprice.ng"
                    style={inlineLinkStyle}
                  >
                    support@showmeprice.ng
                  </Link>
                  .
                </Text>
              </>
            ) : (
              <>
                <Text style={bodyTextStyle}>
                  Your ShowMePrice account has been restored.
                </Text>
                <Text style={bodyTextStyle}>
                  You can sign in and use ShowMePrice again.
                </Text>
                <Text style={bodyTextStyle}>
                  If you still have issues, please email our support team at{" "}
                  <Link
                    href="mailto:support@showmeprice.ng"
                    style={inlineLinkStyle}
                  >
                    support@showmeprice.ng
                  </Link>
                  .
                </Text>
              </>
            )}
          </Section>

          <Hr style={hrStyle} />

          {/* 4. Footer */}
          <Section>
            <Text style={footerTextStyle}>
              You received this email because your ShowMePrice account
              status changed.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Inline styles — mirror AdminProfileChangeEmail.tsx for envelope consistency.
// ---------------------------------------------------------------------------

const bodyStyle = {
  backgroundColor: "#f8fafc",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: 0,
} as const;

const containerStyle = {
  backgroundColor: "#ffffff",
  borderRadius: 8,
  margin: "24px auto",
  maxWidth: 560,
  padding: 32,
} as const;

const brandStyle = {
  color: "#0f172a",
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  margin: 0,
} as const;

const headlineStyle = {
  color: "#0f172a",
  fontSize: 22,
  fontWeight: 700,
  lineHeight: 1.3,
  margin: 0,
} as const;

const bodyTextStyle = {
  color: "#334155",
  fontSize: 15,
  lineHeight: 1.6,
  margin: "0 0 8px 0",
} as const;

const inlineLinkStyle = {
  color: "#0f766e",
  textDecoration: "underline",
} as const;

const hrStyle = {
  border: "none",
  borderTop: "1px solid #e2e8f0",
  margin: "16px 0",
} as const;

const footerTextStyle = {
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.6,
  margin: "4px 0",
} as const;
