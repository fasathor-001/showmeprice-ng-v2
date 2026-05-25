// Stage 2.C Commit 10-c — shared types and pure helpers for the
// /settings/notifications UI. Split out from preferences-actions.ts
// because Next.js requires "use server" files to export only async
// functions. This module is plain code that both client + server import.

/**
 * The subset of notification_event values that the UI surfaces as
 * toggleable. Filters the full enum to user-facing transactional
 * events that currently send email. SMS / push / in_app channels
 * are preserved in the DB but not exposed in the UI (A1 lock —
 * email-channel-only at MVP).
 *
 * Welcome is intentionally NOT in this list — one-time transactional
 * email, not preference-controllable, not in the notification_event
 * enum. Rendered as a static disabled tile separately.
 */
export const USER_FACING_EVENT_TYPES = [
  "new_message",
  "verification_status_change",
] as const;

export type UserFacingEventType = (typeof USER_FACING_EVENT_TYPES)[number];

/**
 * Display label for a user-facing event type. Single source of truth
 * so the label stays consistent across UI render points.
 */
export function eventTypeLabel(eventType: UserFacingEventType): string {
  switch (eventType) {
    case "new_message":
      return "New messages";
    case "verification_status_change":
      return "Verification updates";
  }
}

export function eventTypeDescription(eventType: UserFacingEventType): string {
  switch (eventType) {
    case "new_message":
      return "Email when someone sends you a message and you're offline.";
    case "verification_status_change":
      return "Email when admin approves or rejects your seller verification.";
  }
}

export interface NotificationPreferenceRow {
  eventType: UserFacingEventType;
  emailEnabled: boolean;
}

export interface LoadPreferencesResult {
  preferences?: NotificationPreferenceRow[];
  error?: string;
}

export interface UpdatePreferenceResult {
  ok?: true;
  error?: string;
}
