import type { Metadata } from "next";
import { loadNotificationPreferences } from "@/lib/notifications/preferences-actions";
import { NotificationPreferencesForm } from "./NotificationPreferencesForm";

// /settings/notifications — refactored to inherit from src/app/settings/layout.tsx.
// The previous ad-hoc <main> + max-w-2xl scaffold was the one visual
// inconsistency vs. the rest of the app; now it shares the same
// Container + heading + tab-strip shell as the other settings sub-pages.
//
// Auth gate moved up to the layout. Form behavior (per-toggle save with
// inline "Saved" pill) is unchanged — only the surrounding chrome differs.
//
// Original: Stage 2.C Commit 10-c — TC-025 full notification preferences page.

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Notifications · Settings · ShowMePrice",
  robots: { index: false, follow: false },
};

export default async function NotificationsSettingsPage() {
  const { preferences, error } = await loadNotificationPreferences();

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600">
        Choose which ShowMePrice emails you receive. Changes save
        automatically — you can come back any time to update them.
      </p>

      {/* Defensive: explicit failure surface if the load errored. */}
      {error && (
        <div
          role="alert"
          className="px-4 py-3 rounded-xl bg-danger-bg border border-danger/30 text-danger-text text-sm"
        >
          Couldn&apos;t load your preferences — please refresh and try again.
          ({error})
        </div>
      )}

      {preferences && preferences.length > 0 && (
        <NotificationPreferencesForm initialPreferences={preferences} />
      )}
    </div>
  );
}
