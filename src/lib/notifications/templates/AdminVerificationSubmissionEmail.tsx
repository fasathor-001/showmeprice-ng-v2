// Admin-direction email template: a seller has submitted ID verification
// and the admin (support@showmeprice.ng inbox) is being alerted to review.
//
// Mirrors the four sibling templates' envelope (NewMessageEmail.tsx +
// VerificationApprovedEmail.tsx etc.) — same containerStyle / brandStyle /
// hrStyle / footerTextStyle for consistency. Calm tone per D-124 — this is
// an internal admin alert, not a celebration: short headline, three plain
// facts, single CTA to the review page.
//
// Distinct visual marker for resubmissions: the headline + subject prefix
// shift to "[Resubmission]" so admin can prioritize repeat submissions
// against first-time ones in their inbox view.

import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface AdminVerificationSubmissionEmailProps {
  /** Business name as it appears in `businesses.business_name`. */
  businessName: string;
  /** Seller's display name (profiles.display_name). Null falls back to "(unnamed seller)". */
  sellerName: string | null;
  /** True when a prior seller_verifications row already existed for this business. */
  isResubmission: boolean;
  /** The just-inserted seller_verifications.id — used to construct the review URL. */
  submissionId: string;
  /** Approximate submission timestamp (the dispatcher uses send-time NOW(),
   *  which is sub-second-close to the actual DB submitted_at). Pre-formatted
   *  human string from the dispatcher; template just renders. */
  submittedAtDisplay: string;
  /** Base URL e.g. https://app.showmeprice.ng. */
  appUrl: string;
}

export function AdminVerificationSubmissionEmail({
  businessName,
  sellerName,
  isResubmission,
  submissionId,
  submittedAtDisplay,
  appUrl,
}: AdminVerificationSubmissionEmailProps) {
  const reviewUrl = `${appUrl}/admin/verifications/${submissionId}`;
  const queueUrl = `${appUrl}/admin/verifications`;
  const sellerDisplay = sellerName ?? "(unnamed seller)";
  const headlineText = isResubmission
    ? "[Resubmission] Seller verification pending review"
    : "New seller verification pending review";
  const previewText = isResubmission
    ? `Resubmission from ${businessName} — pending review`
    : `New submission from ${businessName} — pending review`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* 1. Brand header */}
          <Section style={{ paddingBottom: 24 }}>
            <Text style={brandStyle}>
              ShowMePrice<span style={{ color: "#0d9488" }}>.ng</span>
            </Text>
          </Section>

          {/* 2. Headline */}
          <Section style={{ paddingBottom: 8 }}>
            <Text style={headlineStyle}>{headlineText}</Text>
          </Section>

          {/* 3. Body — short facts */}
          <Section style={{ paddingBottom: 16 }}>
            <Text style={bodyTextStyle}>
              {isResubmission
                ? `A seller has resubmitted ID verification after a prior review. The new submission is awaiting admin review.`
                : `A seller has submitted ID verification. The submission is awaiting admin review.`}
            </Text>
          </Section>

          {/* 4. Submission facts */}
          <Section style={{ paddingBottom: 24 }}>
            <Text style={listItemStyle}>
              <strong>Business:</strong> {businessName}
            </Text>
            <Text style={listItemStyle}>
              <strong>Seller:</strong> {sellerDisplay}
            </Text>
            <Text style={listItemStyle}>
              <strong>Submitted:</strong> {submittedAtDisplay}
            </Text>
            {isResubmission && (
              <Text style={listItemStyle}>
                <strong>Type:</strong> Resubmission (a prior submission exists
                for this business)
              </Text>
            )}
          </Section>

          {/* 5. CTA */}
          <Section style={{ paddingBottom: 24 }}>
            <Button href={reviewUrl} style={ctaButtonStyle}>
              Review submission
            </Button>
            <Text style={secondaryLinkRowStyle}>
              <a href={queueUrl} style={secondaryLinkStyle}>
                Or open the full verification queue
              </a>
            </Text>
          </Section>

          <Hr style={hrStyle} />

          {/* 6. Footer */}
          <Section>
            <Text style={footerTextStyle}>
              System-generated admin alert from ShowMePrice. Not user-facing.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Inline styles — copied from VerificationApprovedEmail.tsx for envelope
// consistency across all ShowMePrice transactional surfaces.
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
  margin: "4px 0",
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
