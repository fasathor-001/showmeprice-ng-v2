// E.2.16.0 Step 3 — transactional email template for "admin changed your
// account" notifications. Sent to the affected user after an admin invokes
// admin_change_user_phone or admin_change_user_location. The template is
// generic over `changeType` so a single dispatcher + template pair covers
// both actions (and is extensible to email/suspend/delete in later stages).
//
// Visual envelope mirrors VerificationApprovedEmail (Commit 10-b) — same
// containerStyle / brandStyle / hrStyle / footerTextStyle / Resend wiring —
// so the whole transactional surface stays consistent.
//
// Tone (per D-124): calm, factual, no exclamation marks. Closes with an
// explicit recovery CTA — "If you didn't request this change, reply to
// this email immediately." — because the phone path REVOKES verification
// and the buyer needs an obvious recourse if the change was unexpected.

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

export type ProfileChangeType = "phone" | "location";

interface AdminProfileChangeEmailProps {
  /** Affected user's display name; falls back to "there". */
  userName: string | null;
  /** Which field was changed. */
  changeType: ProfileChangeType;
  /** Base URL e.g. https://showmeprice.ng. */
  appUrl: string;
}

const FIELD_LABEL: Record<ProfileChangeType, string> = {
  phone: "phone number",
  location: "location (state)",
};

export function AdminProfileChangeEmail({
  userName,
  changeType,
  appUrl,
}: AdminProfileChangeEmailProps) {
  const accountUrl = `${appUrl}/settings/account`;
  const settingsUrl = `${appUrl}/settings/notifications`;
  const greetingName = userName ?? "there";
  const fieldLabel = FIELD_LABEL[changeType];
  const phoneNote =
    changeType === "phone"
      ? " Your phone-verified status has been removed; you can re-verify from your account page."
      : "";

  return (
    <Html>
      <Head />
      <Preview>Your ShowMePrice account was updated by support</Preview>
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
            <Text style={headlineStyle}>Your account was updated</Text>
          </Section>

          {/* 3. Body copy — factual statement of what changed. */}
          <Section style={{ paddingBottom: 16 }}>
            <Text style={bodyTextStyle}>
              Hi {greetingName}, a ShowMePrice support team member updated the{" "}
              {fieldLabel} on your account.{phoneNote}
            </Text>
            <Text style={bodyTextStyle}>
              You can review the change on your{" "}
              <Link href={accountUrl} style={inlineLinkStyle}>
                account page
              </Link>
              .
            </Text>
          </Section>

          {/* 4. Recovery CTA — the one paragraph that matters if this was
              not requested. Kept as a distinct block so it doesn't blend
              into the body copy. */}
          <Section style={{ paddingBottom: 16 }}>
            <Text style={recoveryTextStyle}>
              If you didn&apos;t request this change, please reply to this
              email immediately so our team can investigate.
            </Text>
          </Section>

          <Hr style={hrStyle} />

          {/* 5. Footer */}
          <Section>
            <Text style={footerTextStyle}>
              You received this email because a support action was taken on
              your ShowMePrice account.
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
// Inline styles — mirror VerificationApprovedEmail.tsx for envelope consistency.
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

const recoveryTextStyle = {
  color: "#0f172a",
  fontSize: 14,
  lineHeight: 1.6,
  margin: "8px 0 0 0",
  fontWeight: 600,
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

const footerLinkStyle = {
  color: "#0f766e",
  textDecoration: "none",
} as const;
