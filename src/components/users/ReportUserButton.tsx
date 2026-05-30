"use client";

import { useState } from "react";
import { ReportUserModal } from "./ReportUserModal";

// Feature K — trigger button that opens the user-target report modal.
// Renders a small, unobtrusive "Report user" affordance with a flag
// icon. Owns the modal open/close state locally.
//
// This component does NOT gate on auth or self-target — those gates
// are server-rendered at the mount site (/sellers/[slug]) and decided
// when the conversation page hydrates (/messages/[id]). Mount sites
// only render this button when:
//   - currentUserId !== null AND
//   - currentUserId !== targetUserId
// The server action enforces the same checks as defense in depth.

interface ReportUserButtonProps {
  targetUserId: string;
  targetDisplayName: string;
  /**
   * Optional path passed through to the modal for post-submit redirect
   * with ?toast=user-reported. Omit on conversation pages — router
   * refresh is enough.
   */
  redirectTo?: string;
  /**
   * Visual variant. "subtle" matches in-page chrome (shop page header,
   * conversation header). "link" is a plain text link for inline use.
   */
  variant?: "subtle" | "link";
}

export function ReportUserButton({
  targetUserId,
  targetDisplayName,
  redirectTo,
  variant = "subtle",
}: ReportUserButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const subtleClasses =
    "inline-flex items-center gap-1.5 text-xs text-ink-600 hover:text-ink hover:bg-neutral-100 px-2 py-1 rounded transition-colors";
  const linkClasses =
    "inline-flex items-center gap-1 text-xs text-ink-600 hover:text-ink underline-offset-2 hover:underline transition-colors";

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={variant === "subtle" ? subtleClasses : linkClasses}
        aria-label={`Report ${targetDisplayName}`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
        Report
      </button>
      <ReportUserModal
        targetUserId={targetUserId}
        targetDisplayName={targetDisplayName}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        redirectTo={redirectTo}
      />
    </>
  );
}
