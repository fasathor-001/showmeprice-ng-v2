import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";

// /settings/security — two affordances:
//   1. Change password → /forgot-password (sends Supabase reset email).
//      Reuses 100% of existing infra: D-026 (reset page exists), D-027 +
//      D-054 (token_hash flow is cross-browser-safe per K-011 fix).
//   2. Request account deletion → mailto:support@showmeprice.ng with a
//      pre-filled subject + body. Admin-handled per K-004 (no self-service
//      delete; RESTRICT FKs on conversations/messages/orders make hard
//      deletes complex — needs PII-scrub planning).

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Security · Settings · ShowMePrice",
  robots: { index: false, follow: false },
};

const SUPPORT_EMAIL = "support@showmeprice.ng";

const DELETION_BODY = encodeURIComponent(
  "Hi ShowMePrice support team,\n\n" +
    "I'd like to request deletion of my ShowMePrice account.\n\n" +
    "Reason (optional): \n\n" +
    "Thanks.",
);
const DELETION_SUBJECT = encodeURIComponent("Account deletion request");
const DELETION_HREF = `mailto:${SUPPORT_EMAIL}?subject=${DELETION_SUBJECT}&body=${DELETION_BODY}`;

export default function SecuritySettingsPage() {
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-sm font-medium text-ink mb-1">Password</h2>
        <p className="text-xs text-ink-600 mb-4">
          We&apos;ll email you a link to set a new password.
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex items-center justify-center bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700"
        >
          Change password
        </Link>
      </Card>

      <Card>
        <h2 className="text-sm font-medium text-ink mb-1">Account deletion</h2>
        <p className="text-xs text-ink-600 mb-4">
          Account deletion is handled by our team. Send us a request and
          we&apos;ll confirm next steps within 1-2 business days.
        </p>
        <a
          href={DELETION_HREF}
          className="inline-flex items-center justify-center border border-danger/40 text-danger-text bg-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-danger-bg"
        >
          Request account deletion
        </a>
      </Card>
    </div>
  );
}
