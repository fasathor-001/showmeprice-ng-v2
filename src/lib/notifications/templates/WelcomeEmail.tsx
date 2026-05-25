// Stage 2.C Commit 10-c — TC-025 transactional email template for
// "welcome to ShowMePrice" notification.
//
// React Email component. Server-rendered to HTML+plaintext at dispatch
// time. Calm baseline tone per D-124 / DP-12 lock: no exclamation marks,
// no "🎉", no growth-hack copy, no "you've made the right choice"
// language. Stripe / Linear voice — quietly confidently introduces what
// the platform is and three concrete things the user can do next.
//
// Fires once per user, at the moment phone-verification completes
// (verifyPhoneOtpAction success path — D-114 alignment per DP-9 lock).
// Phone is the primary identity gate; welcoming before phone-verify
// would mean welcoming an account that isn't functionally real yet.
//
// Structurally mirrors NewMessageEmail.tsx + VerificationApprovedEmail.tsx
// + VerificationRejectedEmail.tsx — same containerStyle, brandStyle,
// hrStyle, footerTextStyle for envelope consistency across all
// ShowMePrice transactional emails.

import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface WelcomeEmailProps {
  /** User's display name. Falls back to "there" if null. */
  userName: string | null;
  /** Base URL e.g. https://showmeprice.ng (or pages.dev). */
  appUrl: string;
}

export function WelcomeEmail({ userName, appUrl }: WelcomeEmailProps) {
  const browseUrl = `${appUrl}/marketplace`;
  const verifyUrl = `${appUrl}/sell/verify`;
  const settingsUrl = `${appUrl}/settings/notifications`;
  const greetingName = userName ?? "there";

  return (
    <Html>
      <Head />
      <Preview>Welcome to ShowMePrice — Nigeria&apos;s verified marketplace</Preview>
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
            <Text style={headlineStyle}>Welcome to ShowMePrice</Text>
          </Section>

          {/* 3. What ShowMePrice is */}
          <Section style={{ paddingBottom: 16 }}>
            <Text style={bodyTextStyle}>
              Hi {greetingName}, thanks for verifying your phone. ShowMePrice
              is Nigeria&apos;s verified marketplace — sellers post real
              products with real prices, and you contact them directly on
              WhatsApp. No &quot;DM for price,&quot; no middleman.
            </Text>
          </Section>

          {/* 4. Three concrete next-steps */}
          <Section style={{ paddingBottom: 24 }}>
            <Text style={bodyTextStyle}>Three things you can do next:</Text>
            <Text style={listItemStyle}>
              • <strong>Browse listings</strong> — every price is real, every
              seller is verified.
            </Text>
            <Text style={listItemStyle}>
              • <strong>Message sellers directly</strong> — chat in-app or
              tap once to continue on WhatsApp.
            </Text>
            <Text style={listItemStyle}>
              • <strong>Become a verified seller</strong> — if you have
              something to sell, submit your business for verification and
              start listing.
            </Text>
          </Section>

          {/* 5. Primary CTA */}
          <Section style={{ paddingBottom: 16 }}>
            <Button href={browseUrl} style={ctaButtonStyle}>
              Browse listings
            </Button>
            <Text style={secondaryLinkRowStyle}>
              <Link href={verifyUrl} style={secondaryLinkStyle}>
                Or become a verified seller
              </Link>
            </Text>
          </Section>

          <Hr style={hrStyle} />

          {/* 6. Footer */}
          <Section>
            <Text style={footerTextStyle}>
              You received this email because you completed phone verification
              on ShowMePrice.
            </Text>
            <Text style={footerTextStyle}>
              <Link href={settingsUrl} style={footerLinkStyle}>
                Manage notification preferences
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Inline styles — mirror the existing transactional email envelope for
// brand consistency across NewMessageEmail / VerificationApprovedEmail /
// VerificationRejectedEmail / WelcomeEmail.
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

const listItemStyle = {
  color: "#334155",
  fontSize: 14,
  lineHeight: 1.6,
  margin: "6px 0 6px 8px",
} as const;

const ctaButtonStyle = {
  backgroundColor: "#0d9488",
  borderRadius: 8,
  color: "#ffffff",
  display: "inline-block",
  fontSize: 14,
  fontWeight: 600,
  padding: "12px 20px",
  textDecoration: "none",
} as const;

const secondaryLinkRowStyle = {
  margin: "12px 0 0 0",
} as const;

const secondaryLinkStyle = {
  color: "#0f766e",
  fontSize: 14,
  textDecoration: "none",
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

const footerLinkStyle = {
  color: "#0f766e",
  textDecoration: "none",
} as const;
