import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadNotificationPreferences } from "@/lib/notifications/preferences-actions";
import { NotificationPreferencesForm } from "./NotificationPreferencesForm";

// Required by @cloudflare/next-on-pages: every non-static route must declare
// the edge runtime explicitly. Server-rendered (uses Metadata + server-side
// auth check + DB read for current preferences). Matches project-wide
// convention used by every other page.tsx.
export const runtime = "edge";

// Stage 2.C Commit 10-c — TC-025 full notification preferences page.
//
// Replaces the Commit 8 placeholder (formerly stub at this path).
// Reads current preferences from the existing notification_preferences
// table (Option A locked — strictly more capable than a JSON column).
// UI exposes the email channel only (A1 lock); other channel columns
// preserved untouched. Welcome shown as a static disabled tile (not in
// the notification_event enum — one-time transactional).

export const metadata: Metadata = {
  title: "Notification settings · ShowMePrice",
  robots: { index: false, follow: false },
};

export default async function NotificationsSettingsPage() {
  // Server-side auth check + preferences load. Redirect to sign-in if
  // the user isn't authenticated — this page is private.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in?next=/settings/notifications");
  }

  const { preferences, error } = await loadNotificationPreferences();

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-neutral-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-ink">
            Notification settings
          </h1>
          <p className="mt-2 text-sm text-ink-600 leading-relaxed">
            Choose which ShowMePrice emails you receive. Changes save
            automatically — you can come back any time to update them.
          </p>
        </div>

        {/* Defensive rendering — explicit failure surface if load errored. */}
        {error && (
          <div
            role="alert"
            className="mb-4 px-4 py-3 rounded-xl bg-danger-bg border border-danger/30 text-danger-text text-sm"
          >
            Couldn&apos;t load your preferences — please refresh and try
            again. ({error})
          </div>
        )}

        {preferences && preferences.length > 0 && (
          <NotificationPreferencesForm initialPreferences={preferences} />
        )}

        {/* Footer nav back to dashboard */}
        <div className="mt-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm text-teal-700 hover:text-teal-800 focus:outline-none focus-visible:underline"
          >
            ← Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
