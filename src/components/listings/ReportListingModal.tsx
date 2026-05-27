"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// DP-202: Nigerian-context report categories
const REPORT_REASONS = [
  { value: "Scam/Fraud", label: "Scam/Fraud" },
  { value: "Misleading listing", label: "Misleading listing" },
  { value: "Stolen item", label: "Stolen item" },
  { value: "Prohibited item", label: "Prohibited item" },
  { value: "Other", label: "Other" },
] as const;

interface ReportListingModalProps {
  listingId: string;
  listingTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ReportListingModal({
  listingId,
  listingTitle,
  isOpen,
  onClose,
  onSuccess,
}: ReportListingModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReason) {
      setError("Please select a reason");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("You must be signed in to report a listing");
        setIsSubmitting(false);
        return;
      }

      // Insert into reports table with verified schema:
      // target_type: enum (listing already exists in report_target_type)
      // target_id: uuid (listing id)
      // reason: text (DP-202 category)
      // description: text nullable, CHECK (char_length <= 200)
      // Created_at, status default to now() and 'new' respectively
      const { error: insertError } = await supabase
        .from("reports")
        .insert({
          reporter_id: user.id,
          target_type: "listing",
          target_id: listingId,
          reason: selectedReason,
          description: description.trim().length > 0 ? description.trim() : null,
        });

      if (insertError) throw insertError;

      // Reset form and close modal
      setSelectedReason("");
      setDescription("");
      onClose();
      onSuccess?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit report"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-4 sm:p-6 border-b border-neutral-200">
          <div className="flex-1 min-w-0">
            <h2 id="report-modal-title" className="font-medium text-ink">
              Report listing
            </h2>
            <p className="text-xs text-ink-600 mt-1 truncate">
              {listingTitle}
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
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {/* Error state */}
          {error && (
            <div className="bg-danger-bg border border-danger/30 rounded-lg p-3">
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
                <label key={option.value} className="flex items-center gap-3">
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
              htmlFor="report-description"
              className="block text-sm font-medium text-ink mb-2"
            >
              Details (optional)
            </label>
            <textarea
              id="report-description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 200))}
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
              disabled={isSubmitting || !selectedReason}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Submitting..." : "Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
