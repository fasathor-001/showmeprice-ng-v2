// Stage 2.C Commit 8 — TC-023 transactional email template for
// "offline recipient gets a new message" notification.
//
// React Email component. Server-rendered to HTML+plaintext via
// @react-email/render at email-dispatch time. Body structure (per §6.F
// surface findings):
//   1. Logo header — small teal "ShowMePrice.ng"
//   2. Sender block — "{senderName} sent you a message:"
//   3. Message preview — quoted block, max 140 chars + ellipsis
//   4. Listing card — thumbnail (96px) + title + formatted price
//   5. Primary CTA — "Reply on ShowMePrice" → /messages/{conversationId}
//   6. Footer — disclosure + "Manage notification preferences" link
//
// No "Unsubscribe" link (transactional, not marketing) per §6.G. Footer
// link to /settings/notifications stub.

import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

const PREVIEW_MAX_CHARS = 140;

interface NewMessageEmailProps {
  senderName: string;
  messagePreview: string;
  conversationId: string;
  listingTitle: string | null;
  listingPriceNaira: string | null; // pre-formatted, e.g. "₦450,000"
  listingImageUrl: string | null;
  appUrl: string; // base URL e.g. https://showmeprice.ng (or pages.dev)
}

function clipPreview(text: string): string {
  if (text.length <= PREVIEW_MAX_CHARS) return text;
  return text.slice(0, PREVIEW_MAX_CHARS - 1).trimEnd() + "…";
}

export function NewMessageEmail({
  senderName,
  messagePreview,
  conversationId,
  listingTitle,
  listingPriceNaira,
  listingImageUrl,
  appUrl,
}: NewMessageEmailProps) {
  const replyUrl = `${appUrl}/messages/${conversationId}`;
  const settingsUrl = `${appUrl}/settings/notifications`;
  const clippedPreview = clipPreview(messagePreview);

  return (
    <Html>
      <Head />
      <Preview>{`${senderName} sent you a message on ShowMePrice`}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* 1. Logo header */}
          <Section style={{ paddingBottom: 24 }}>
            <Text style={brandStyle}>
              ShowMePrice<span style={{ color: "#0d9488" }}>.ng</span>
            </Text>
          </Section>

          {/* 2. Sender block */}
          <Section style={{ paddingBottom: 8 }}>
            <Text style={greetingStyle}>
              <strong>{senderName}</strong> sent you a message:
            </Text>
          </Section>

          {/* 3. Message preview — quoted block */}
          <Section style={previewBlockStyle}>
            <Text style={previewTextStyle}>{clippedPreview}</Text>
          </Section>

          {/* 4. Listing card — thumbnail + title + price */}
          {listingTitle && (
            <Section style={listingCardStyle}>
              <table
                role="presentation"
                cellPadding={0}
                cellSpacing={0}
                style={{ width: "100%", borderCollapse: "collapse" }}
              >
                <tr>
                  {listingImageUrl && (
                    <td
                      style={{
                        width: 96,
                        verticalAlign: "top",
                        paddingRight: 12,
                      }}
                    >
                      <Img
                        src={listingImageUrl}
                        alt=""
                        width={96}
                        height={96}
                        style={listingImgStyle}
                      />
                    </td>
                  )}
                  <td style={{ verticalAlign: "top" }}>
                    <Text style={listingTitleStyle}>{listingTitle}</Text>
                    {listingPriceNaira && (
                      <Text style={listingPriceStyle}>{listingPriceNaira}</Text>
                    )}
                  </td>
                </tr>
              </table>
            </Section>
          )}

          {/* 5. Primary CTA */}
          <Section style={{ paddingTop: 16, paddingBottom: 24 }}>
            <Button href={replyUrl} style={ctaButtonStyle}>
              Reply on ShowMePrice
            </Button>
          </Section>

          <Hr style={hrStyle} />

          {/* 6. Footer */}
          <Section>
            <Text style={footerTextStyle}>
              You received this email because someone messaged you on
              ShowMePrice.
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
// Inline styles — required by email clients (CSS classes have spotty support)
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

const greetingStyle = {
  color: "#0f172a",
  fontSize: 16,
  lineHeight: 1.5,
  margin: 0,
} as const;

const previewBlockStyle = {
  backgroundColor: "#f1f5f9",
  borderLeft: "3px solid #0d9488",
  borderRadius: 4,
  padding: "12px 16px",
  margin: "0 0 16px 0",
} as const;

const previewTextStyle = {
  color: "#334155",
  fontSize: 14,
  fontStyle: "italic" as const,
  lineHeight: 1.55,
  margin: 0,
  whiteSpace: "pre-wrap" as const,
};

const listingCardStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 12,
} as const;

const listingImgStyle = {
  borderRadius: 6,
  display: "block",
  height: 96,
  objectFit: "cover" as const,
  width: 96,
};

const listingTitleStyle = {
  color: "#0f172a",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.4,
  margin: "0 0 6px 0",
} as const;

const listingPriceStyle = {
  color: "#0f766e",
  fontSize: 14,
  fontWeight: 600,
  margin: 0,
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
