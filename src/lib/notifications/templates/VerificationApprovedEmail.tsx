// Stage 2.C Commit 10-b — TC-024 transactional email template for
// "admin approved your seller verification" notification.
//
// React Email component. Server-rendered to HTML+plaintext at dispatch
// time. Calm tone per D-124: no exclamation marks, no growth-hack copy,
// no celebration emoji. The product moment IS a celebration but the
// brand voice stays restrained — a Stripe/Linear-style confirmation,
// not a SaaS-launch shout. Three short next-steps that mirror the
// dashboard's actual affordances.
//
// Structurally mirrors NewMessageEmail.tsx (Commit 8) — same containerStyle,
// brandStyle, hrStyle, footerTextStyle so the email envelope feels
// consistent across all ShowMePrice transactional surfaces.

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

interface VerificationApprovedEmailProps {
  /** Seller's display name. Falls back to "your" if null. */
  sellerName: string | null;
  /** Base URL e.g. https://showmeprice.ng (or pages.dev). */
  appUrl: string;
}

export function VerificationApprovedEmail({
  sellerName,
  appUrl,
}: VerificationApprovedEmailProps) {
  const dashboardUrl = `${appUrl}/dashboard`;
  const newListingUrl = `${appUrl}/listings/new`;
  const settingsUrl = `${appUrl}/settings/notifications`;
  const greetingName = sellerName ?? "there";

  return (
    <Html>
      <Head />
      <Preview>Your ShowMePrice account is verified</Preview>
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
            <Text style={headlineStyle}>Your account is verified</Text>
          </Section>

          {/* 3. Body copy */}
          <Section style={{ paddingBottom: 16 }}>
            <Text style={bodyTextStyle}>
              Hi {greetingName}, your seller verification has been approved.
              Your business is now live on ShowMePrice and your listings are
              visible to buyers.
            </Text>
          </Section>

          {/* 4. What's next list */}
          <Section style={{ paddingBottom: 24 }}>
            <Text style={bodyTextStyle}>What you can do now:</Text>
            <Text style={listItemStyle}>
              • Post your first listing with real photos and prices.
            </Text>
            <Text style={listItemStyle}>
              • Reply to buyer messages directly from your dashboard.
            </Text>
            <Text style={listItemStyle}>
              • Add payment details when you&apos;re ready to receive
              deposits.
            </Text>
          </Section>

          {/* 5. Primary CTA */}
          <Section style={{ paddingBottom: 24 }}>
            <Button href={newListingUrl} style={ctaButtonStyle}>
              Post your first listing
            </Button>
            <Text style={secondaryLinkRowStyle}>
              <Link href={dashboardUrl} style={secondaryLinkStyle}>
                Or go to your dashboard
              </Link>
            </Text>
          </Section>

          <Hr style={hrStyle} />

          {/* 6. Footer */}
          <Section>
            <Text style={footerTextStyle}>
              You received this email because your ShowMePrice seller
              verification was reviewed.
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
// Inline styles — mirror NewMessageEmail.tsx (Commit 8) for envelope
// consistency. Only the body-section-specific styles differ.
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
  margin: "4px 0 4px 8px",
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
