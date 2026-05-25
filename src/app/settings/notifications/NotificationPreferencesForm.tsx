"use client";

// Stage 2.C Commit 10-c — client-side form for the /settings/notifications
// preferences UI. Renders one toggle per user-facing event type plus a
// static disabled tile for welcome (one-time, not preference-controllable).
//
// Calm-UI per D-124: no toast spam, no over-eager confirmations. Each
// toggle saves on change with an inline "Saved" pill that fades after
// ~2 seconds. Failure surfaces an inline error pill next to the affected
// toggle, never blocks the rest of the UI.
//
// useTransition wraps the server-action call so the toggle remains
// responsive (optimistic flip on click; rollback only on error).

import { useState, useTransition } from "react";
import { updateNotificationPreference } from "@/lib/notifications/preferences-actions";
import {
  eventTypeDescription,
  eventTypeLabel,
  type NotificationPreferenceRow,
  type UserFacingEventType,
} from "@/lib/notifications/preferences";

interface Props {
  initialPreferences: NotificationPreferenceRow[];
}

type RowStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export function NotificationPreferencesForm({ initialPreferences }: Props) {
  const [prefs, setPrefs] =
    useState<NotificationPreferenceRow[]>(initialPreferences);
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({});
  const [, startTransition] = useTransition();

  const handleToggle = (eventType: UserFacingEventType, nextValue: boolean) => {
    // Optimistic UI flip.
    setPrefs((prev) =>
      prev.map((p) =>
        p.eventType === eventType ? { ...p, emailEnabled: nextValue } : p,
      ),
    );
    setStatuses((prev) => ({ ...prev, [eventType]: { kind: "saving" } }));

    startTransition(async () => {
      const result = await updateNotificationPreference(eventType, nextValue);
      if (result.error) {
        // Rollback on failure.
        setPrefs((prev) =>
          prev.map((p) =>
            p.eventType === eventType
              ? { ...p, emailEnabled: !nextValue }
              : p,
          ),
        );
        setStatuses((prev) => ({
          ...prev,
          [eventType]: {
            kind: "error",
            message: result.error ?? "Couldn't save.",
          },
        }));
        return;
      }
      setStatuses((prev) => ({ ...prev, [eventType]: { kind: "saved" } }));
      // Fade the "Saved" pill after a beat.
      window.setTimeout(() => {
        setStatuses((prev) =>
          prev[eventType]?.kind === "saved"
            ? { ...prev, [eventType]: { kind: "idle" } }
            : prev,
        );
      }, 2000);
    });
  };

  return (
    <div className="space-y-3">
      {prefs.map((p) => {
        const status = statuses[p.eventType] ?? { kind: "idle" };
        return (
          <PreferenceRow
            key={p.eventType}
            label={eventTypeLabel(p.eventType)}
            description={eventTypeDescription(p.eventType)}
            checked={p.emailEnabled}
            disabled={false}
            status={status}
            onToggle={(v) => handleToggle(p.eventType, v)}
          />
        );
      })}

      {/* Static disabled tile for welcome — one-time transactional email,
          not preference-controllable. Communicates the email exists
          without offering a meaningless toggle. */}
      <PreferenceRow
        label="Welcome email"
        description="One-time email sent when you complete phone verification."
        checked={true}
        disabled={true}
        status={{ kind: "idle" }}
        helperPill="One-time"
      />
    </div>
  );
}

interface RowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  status: RowStatus;
  onToggle?: (next: boolean) => void;
  helperPill?: string;
}

function PreferenceRow({
  label,
  description,
  checked,
  disabled,
  status,
  onToggle,
  helperPill,
}: RowProps) {
  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-4 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-ink">{label}</h3>
          {helperPill && (
            <span className="inline-flex items-center rounded-full bg-neutral-100 text-ink-600 text-xs px-2 py-0.5">
              {helperPill}
            </span>
          )}
          {status.kind === "saved" && (
            <span
              role="status"
              className="inline-flex items-center rounded-full bg-teal-50 text-teal-700 text-xs px-2 py-0.5"
            >
              Saved
            </span>
          )}
          {status.kind === "saving" && (
            <span className="inline-flex items-center rounded-full bg-neutral-100 text-ink-600 text-xs px-2 py-0.5">
              Saving…
            </span>
          )}
          {status.kind === "error" && (
            <span
              role="alert"
              className="inline-flex items-center rounded-full bg-danger-bg text-danger-text text-xs px-2 py-0.5"
            >
              {status.message}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-ink-600 leading-relaxed">
          {description}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`Toggle ${label}`}
        disabled={disabled || status.kind === "saving"}
        onClick={() => onToggle?.(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 ${
          checked ? "bg-teal-600" : "bg-neutral-300"
        } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
