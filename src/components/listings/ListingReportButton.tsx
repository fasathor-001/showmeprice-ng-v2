"use client";

import { useState } from "react";
import { ReportListingModal } from "./ReportListingModal";

interface ListingReportButtonProps {
  listingId: string;
  listingTitle: string;
}

export function ListingReportButton({
  listingId,
  listingTitle,
}: ListingReportButtonProps) {
  const [reportModalOpen, setReportModalOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setReportModalOpen(true)}
        className="text-xs text-ink-400 hover:text-danger transition-colors"
        title="Report this listing"
      >
        Report
      </button>
      <ReportListingModal
        listingId={listingId}
        listingTitle={listingTitle}
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
      />
    </>
  );
}
