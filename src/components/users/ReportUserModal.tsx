"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  reportUserAction,
  type ReportUserResult,
} from "@/lib/users/report-user-action";

// Feature K — modal for submitting a user-target moderation report.
//
// Mirrors the visual shape of ReportListingModal (E.2.13.0 / DP-202)
// for surface consistency: same fixed-overlay + rounded card + header
// with truncated context + reason radio group + optional details
// textarea with 200-char counter + Cancel / Report buttons.
//
// Submission differs from ReportListingModal: this modal calls a
// server action (reportUserAction) instead of a direct supabase
// INSERT. The server action enforces the self-report block + 7-day
// rate limit per (reporter, target) per Frank's locked Feature K
// decisions — those guards cannot be trusted in client code.
//
// Reason taxonomy is user-specific (impersonation, harassment, scam,
// inappropriate, other) and distinct from the listing taxonomy
// (DP-202). The locked list is also defined inside the server action
// so the closed-set validation lives on the trusted side.

const REPORT_REASONS = [
  { value: "Impersonation", label: "Impersonation" },
  { value: "Harassment or abuse", label: "Harassment or abuse" },
  { value: "Scam attempt", label: "Scam attempt" },
  { value: "Inappropriate content", label: "Inappropriate content" },
  { value: "Other", label: "Other" },
] as const;

interface ReportUserModalProps {
  targetUserId: string;
  targetDisplayName: string;
  isOpen: boolean;
  onClose: () => void;
  /**
   * Optional path to redirect to on success (with ?toast=user-reported
   * appended). If omitted, the modal just closes and triggers a
   * router.refresh().
   */
  redirectTo?: string;
}

export function ReportUserModal({
  targetUserId,
  targetDisplayName,
  isOpen,
  onClose,
  redirectTo,
}: ReportUserModalProps) {
  const router = useRouter();
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit = selectedReason.length > 0 && !isPending;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedReason) {
      setError("Please select a reason");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res: ReportUserResult = await reportUserAction(
        targetUserId,
        selectedReason,
        description.trim().length > 0 ? description.trim() : null,
      );
      if (res.error) {
        setError(res.error);
        return;
      }
      // Reset and close.
      setSelectedReason("");
      setDescription("");
      onClose();
      if (redirectTo) {
        router.push(`${redirectTo}?toast=user-reported`);
        router.refresh();
      } else {
        router.refresh();
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-user-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-4 sm:p-6 border-b border-neutral-200">
          <div className="flex-1 min-w-0">
            <h2
              id="report-user-modal-title"
              className="font-medium text-ink"
            >
              Report user
            </h2>
            <p className="text-xs text-ink-600 mt-1 truncate">
              {targetDisplayName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-ink-400 hover:text-ink hover:bg-neutral-100 transition-colors"
            aria-label="Close"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6l-12 12M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="p-4 sm:p-6 space-y-4"
        >
          {/* Error state */}
          {error && (
            <div
              role="alert"
              className="bg-danger-bg border border-danger/30 rounded-lg p-3"
            >
              <p className="text-sm text-danger-text">{error}</p>
            </div>
          )}

          {/* Reason selection */}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              What&apos;s the issue?
            </label>
            <div className="space-y-2">
              {REPORT_REASONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-3"
                >
                  <input
                    type="radio"
                    name="reason"
                    value={option.value}
                    checked={selectedReason === option.value}
                    onChange={(e) => setSelectedReason(e.target.value)}
                    className="w-4 h-4 accent-teal-600"
                  />
                  <span className="text-sm text-ink">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Description field */}
          <div>
            <label
              htmlFor="report-user-description"
              className="block text-sm font-medium text-ink mb-2"
            >
              Details (optional)
            </label>
            <textarea
              id="report-user-description"
              value={description}
              onChange={(e) =>
                setDescription(e.target.value.slice(0, 200))
              }
              placeholder="Provide additional context..."
              maxLength={200}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400 resize-none"
              rows={3}
            />
            <p className="text-xs text-ink-400 mt-1">
              {description.length}/200 characters
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-ink border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? "Submitting..." : "Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
