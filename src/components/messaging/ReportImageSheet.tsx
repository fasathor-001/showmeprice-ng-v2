"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

// Stage 2.C Commit 9-b — read-only report-image action sheet.
//
// Bottom-sheet on mobile, centered modal on desktop — matches
// MessageSellerModal's existing pattern (internal product consistency =
// distinct-from-WhatsApp without being weird).
//
// Two-step flow (per original §10.A-D):
//   1. Action sheet: "Report image" (danger color) · Cancel
//   2. Reason sheet: chips (Inappropriate / Misleading / Other) + optional
//      details textarea (≤200 chars, matches reports.description CHECK) →
//      Submit → inline acknowledgment toast (inside ImageViewer context;
//      not a global toast spam — D-124 calm UI).
//
// 9-b SUBMIT IS A PLACEHOLDER. The server `reportMessage` action will
// ship in 9-c (bundled with sendImageMessage, the other write path). In
// 9-b: submit just resolves with success after a short delay so the UX
// flow is verifiable, and logs a TODO marker to console. Acceptable
// because no image messages exist yet to report.

const REASON_CHIPS = [
  { id: "inappropriate", label: "Inappropriate content" },
  { id: "misleading", label: "Misleading product" },
  { id: "other", label: "Other" },
] as const;

const MAX_DETAILS = 200;

interface ReportImageSheetProps {
  messageId: string;
  onClose: () => void;
  /** Called after a successful submit so the viewer can show its inline toast. */
  onSubmitted: () => void;
}

type Step = "menu" | "reason" | "sending";

export function ReportImageSheet({
  messageId,
  onClose,
  onSubmitted,
}: ReportImageSheetProps) {
  const [step, setStep] = useState<Step>("menu");
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setAnimateIn(true));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!selectedReason || step === "sending") return;
    setStep("sending");
    setError(null);

    // 9-b PLACEHOLDER — the real reportMessage server action ships in 9-c.
    // We simulate a successful network call so the UX flow is exercisable
    // (sheet collapses, viewer shows acknowledgment) without actually
    // writing to the reports table. Wire to reportMessage() in 9-c.
    const chip = REASON_CHIPS.find((c) => c.id === selectedReason);
    const reason = chip?.label ?? selectedReason;
    console.warn(
      "[ReportImageSheet] placeholder submit — wire to reportMessage() in 9-c",
      { messageId, reason, details: details.trim() || null },
    );
    await new Promise((r) => setTimeout(r, 250));
    onSubmitted();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-image-title"
    >
      {/* Backdrop. Tap to close. */}
      <button
        type="button"
        className={`absolute inset-0 bg-ink/40 transition-opacity duration-200 motion-reduce:transition-none ${
          animateIn ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-label="Close report"
        tabIndex={-1}
      />

      <div
        className={`relative bg-white shadow-xl flex flex-col
                    w-full sm:w-[420px] sm:max-w-[calc(100vw-2rem)]
                    rounded-t-2xl sm:rounded-2xl
                    mt-auto sm:my-auto
                    max-h-[85vh] sm:max-h-[90vh]
                    transition-transform duration-200 ease-out motion-reduce:transition-none
                    ${animateIn ? "translate-y-0" : "translate-y-full sm:translate-y-0"}`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 shrink-0">
          <h2
            id="report-image-title"
            className="text-base font-semibold text-ink"
          >
            {step === "menu" ? "Image actions" : "Report this image"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-10 h-10 -mr-2 rounded-lg text-ink-600 hover:bg-neutral-100 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {step === "menu" && (
          <div className="p-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setStep("reason")}
              className="w-full text-left px-4 py-3 rounded-lg text-danger-text hover:bg-danger-bg/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-text/40"
            >
              Report image
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full text-left px-4 py-3 rounded-lg text-ink-600 hover:bg-neutral-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            >
              Cancel
            </button>
          </div>
        )}

        {(step === "reason" || step === "sending") && (
          <div className="p-4 flex flex-col gap-3">
            <p className="text-sm text-ink-600">
              Why are you reporting this image?
            </p>
            <div className="flex flex-wrap gap-2">
              {REASON_CHIPS.map((chip) => {
                const active = selectedReason === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setSelectedReason(chip.id)}
                    disabled={step === "sending"}
                    className={`inline-flex items-center px-3 h-10 rounded-full text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:opacity-60 disabled:cursor-not-allowed ${
                      active
                        ? "bg-teal-600 text-white"
                        : "bg-neutral-100 text-ink-600 hover:bg-neutral-200"
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, MAX_DETAILS))}
              placeholder="Add details (optional)"
              rows={3}
              disabled={step === "sending"}
              className="w-full resize-none rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 disabled:bg-neutral-50"
              aria-label="Report details"
            />
            <div className="text-xs text-right text-ink-400">
              {details.length} / {MAX_DETAILS}
            </div>
            {error && (
              <div
                role="alert"
                className="px-3 py-2 rounded-lg bg-danger-bg text-danger-text text-xs"
              >
                {error}
              </div>
            )}
            <Button
              variant="primary"
              size="md"
              onClick={handleSubmit}
              disabled={!selectedReason || step === "sending"}
              fullWidth
            >
              {step === "sending" ? "Submitting…" : "Submit report"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
