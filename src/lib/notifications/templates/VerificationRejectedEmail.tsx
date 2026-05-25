// Stage 2.C Commit 10-b — TC-024 transactional email template for
// "admin rejected your seller verification" notification.
//
// React Email component. Server-rendered to HTML+plaintext at dispatch
// time. Calm tone per D-124: no shame, no blame language, no
// exclamation marks. The seller wrote a verification submission and is
// waiting on a decision — the email should be honest about the
// rejection and immediately actionable about the recovery path.
//
// The rejection_reason is quoted verbatim (per DP-6 / surface findings
// approval). Quoting directly lets the seller act without having to
// log in. Framed by "Our review team noted:" so the reason reads as
// review note rather than confrontation.
//
// Structurally mirrors NewMessageEmail.tsx + VerificationApprovedEmail.tsx
// (same containerStyle, brandStyle, hrStyle, footerTextStyle) so the
// transactional email envelope stays consistent.

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

interface VerificationRejectedEmailProps {
  /** Seller's display name. Falls back to "there" if null. */
  sellerName: string | null;
  /** The verbatim rejection reason from rejectVerificationAction's form. */
  rejectionReason: string;
  /** Base URL e.g. https://showmeprice.ng (or pages.dev). */
  appUrl: string;
}

export function VerificationRejectedEmail({
  sellerName,
  rejectionReason,
  appUrl,
}: VerificationRejectedEmailProps) {
  const resubmitUrl = `${appUrl}/sell/verify`;
  const settingsUrl = `${appUrl}/settings/notifications`;
  const greetingName = sellerName ?? "there";

  return (
    <Html>
      <Head />
      <Preview>We couldn&apos;t verify your account</Preview>
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
            <Text style={headlineStyle}>
              We couldn&apos;t verify your account
            </Text>
          </Section>

          {/* 3. Body copy */}
          <Section style={{ paddingBottom: 8 }}>
            <Text style={bodyTextStyle}>
              Hi {greetingName}, we reviewed your seller verification but
              couldn&apos;t approve it as submitted.
            </Text>
          </Section>

          {/* 4. Rejection reason — quoted verbatim */}
          <Section style={{ paddingBottom: 16 }}>
            <Text style={reasonLabelStyle}>Our review team noted:</Text>
            <Section style={reasonBlockStyle}>
              <Text style={reasonTextStyle}>{rejectionReason}</Text>
            </Section>
          </Section>

          {/* 5. Next steps */}
          <Section style={{ paddingBottom: 24 }}>
            <Text style={bodyTextStyle}>
              Once you&apos;ve addressed this, you can resubmit your
              verification from your dashboard. Each submission is reviewed
              individually.
            </Text>
          </Section>

          {/* 6. Primary CTA */}
          <Section style={{ paddingBottom: 24 }}>
            <Button href={resubmitUrl} style={ctaButtonStyle}>
              Resubmit verification
            </Button>
          </Section>

          <Hr style={hrStyle} />

          {/* 7. Footer */}
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
// Inline styles — mirror NewMessageEmail.tsx + VerificationApprovedEmail.tsx.
// Only reason-block-specific styles differ.
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
  margin: 0,
} as const;

const reasonLabelStyle = {
  color: "#475569",
  fontSize: 13,
  fontWeight: 600,
  margin: "0 0 6px 0",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
} as const;

const reasonBlockStyle = {
  backgroundColor: "#fef3c7",
  borderLeft: "3px solid #d97706",
  borderRadius: 4,
  padding: "12px 16px",
  margin: 0,
} as const;

const reasonTextStyle = {
  color: "#78350f",
  fontSize: 14,
  lineHeight: 1.55,
  margin: 0,
  whiteSpace: "pre-wrap" as const,
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
