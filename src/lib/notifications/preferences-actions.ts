"use server";

// Stage 2.C Commit 10-c — server actions for reading and updating the
// current user's notification preferences. Operates against the
// existing notification_preferences table (Option A locked — strictly
// more capable than the JSON column the surface findings initially
// proposed, supports per-channel × per-event granularity).
//
// At MVP the UI only exposes email_enabled per event type. SMS / push /
// in_app columns are preserved untouched in the DB so future surfaces
// can expose them without a schema change (A1 lock).
//
// Single-responsibility: separate read (loadNotificationPreferences)
// from write (updateNotificationPreference). No dual-purpose helper.
//
// Shared types + pure helpers live in ./preferences.ts (Next.js
// requires "use server" files to export only async functions).

import { createClient } from "@/lib/supabase/server";
import {
  USER_FACING_EVENT_TYPES,
  type LoadPreferencesResult,
  type NotificationPreferenceRow,
  type UpdatePreferenceResult,
  type UserFacingEventType,
} from "./preferences";

/**
 * Load the current signed-in user's email preferences for user-facing
 * event types. Falls back to opted-in (true) when a row is missing
 * (matches dispatcher fallback in send-message-notification.ts +
 * send-verification-decision-notification.ts).
 */
export async function loadNotificationPreferences(): Promise<LoadPreferencesResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("event_type, email_enabled")
    .eq("user_id", user.id)
    .in("event_type", USER_FACING_EVENT_TYPES as readonly string[]);

  if (error) {
    return { error: error.message };
  }

  // Build a complete result with every user-facing event represented,
  // even if the DB has no row for it (treat missing as opted-in to
  // match dispatcher fallback).
  const byEvent = new Map<string, boolean>();
  (data ?? []).forEach((row) => {
    byEvent.set(row.event_type as string, row.email_enabled !== false);
  });

  const preferences: NotificationPreferenceRow[] = USER_FACING_EVENT_TYPES.map(
    (et) => ({
      eventType: et,
      emailEnabled: byEvent.get(et) ?? true,
    }),
  );

  return { preferences };
}

/**
 * Update a single (event_type, email_enabled) row for the current user.
 * Upsert against the composite PK (user_id, event_type) so the call is
 * idempotent and works whether or not the trigger-seeded row exists.
 *
 * Other channel columns (sms_enabled / in_app_enabled / push_enabled)
 * are NOT touched — defensive: only ever write email_enabled at MVP
 * per A1 lock.
 */
export async function updateNotificationPreference(
  eventType: UserFacingEventType,
  emailEnabled: boolean,
): Promise<UpdatePreferenceResult> {
  if (!(USER_FACING_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return { error: "Unsupported event type" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  // Upsert against the composite PK. The trigger-seeded row should
  // already exist for active users; the upsert handles both cases
  // cleanly.
  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: user.id,
      event_type: eventType,
      email_enabled: emailEnabled,
    },
    { onConflict: "user_id,event_type" },
  );

  if (error) {
    return { error: error.message };
  }

  return { ok: true };
}
