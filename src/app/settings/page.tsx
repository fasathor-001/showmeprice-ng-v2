import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";

// /settings index — overview cards pointing at each section + a subtle
// "Contact support to delete your account" affordance at the bottom.
// Auth gate inherited from layout.tsx.

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Settings · ShowMePrice",
  robots: { index: false, follow: false },
};

const SUPPORT_EMAIL = "support@showmeprice.ng";

// Pre-filled deletion-request body. The user reviews + edits before sending
// from their own mail client, so this just seeds the thread.
const DELETION_BODY = encodeURIComponent(
  "Hi ShowMePrice support team,\n\n" +
    "I'd like to request deletion of my ShowMePrice account.\n\n" +
    "Reason (optional): \n\n" +
    "Thanks.",
);
const DELETION_SUBJECT = encodeURIComponent("Account deletion request");
const DELETION_HREF = `mailto:${SUPPORT_EMAIL}?subject=${DELETION_SUBJECT}&body=${DELETION_BODY}`;

export default function SettingsIndexPage() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 mb-2">
        Manage your account details, email preferences, and security.
      </p>

      <Link href="/settings/account" className="block">
        <Card variant="hover">
          <h2 className="text-base font-medium text-ink mb-1">Account</h2>
          <p className="text-xs text-ink-600">
            Your name, phone, email, location, verification status, and plan.
          </p>
        </Card>
      </Link>

      <Link href="/settings/notifications" className="block">
        <Card variant="hover">
          <h2 className="text-base font-medium text-ink mb-1">Notifications</h2>
          <p className="text-xs text-ink-600">
            Choose which emails you receive from ShowMePrice.
          </p>
        </Card>
      </Link>

      <Link href="/settings/security" className="block">
        <Card variant="hover">
          <h2 className="text-base font-medium text-ink mb-1">Security</h2>
          <p className="text-xs text-ink-600">
            Change your password or request account deletion.
          </p>
        </Card>
      </Link>

      <div className="pt-6 border-t border-neutral-200">
        <p className="text-xs text-ink-600">
          Need to delete your account?{" "}
          <a
            href={DELETION_HREF}
            className="text-teal-700 hover:text-teal-900 underline"
          >
            Contact support →
          </a>
        </p>
      </div>
    </div>
  );
}
