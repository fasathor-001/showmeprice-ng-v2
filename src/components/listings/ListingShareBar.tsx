"use client";

import { useState } from "react";
import { formatNaira } from "@/lib/listings";

interface ListingShareBarProps {
  listingId: string;
  listingTitle: string;
  listingPriceKobo: number;
  listingStateName: string | null;
}

export function ListingShareBar({
  listingId,
  listingTitle,
  listingPriceKobo,
  listingStateName,
}: ListingShareBarProps) {
  const [copySuccess, setCopySuccess] = useState(false);

  const listingUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/listings/${listingId}`
      : `/listings/${listingId}`;

  const formattedPrice = formatNaira(listingPriceKobo);
  const location = listingStateName || "Nigeria";

  // DP-205: WhatsApp message template with Nigerian price format (₦formatted)
  const whatsappMessage = `Check out this listing on ShowMePrice:\n${listingTitle}\n${formattedPrice} | ${location}\n${listingUrl}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

  const handleCopyLink = async () => {
    try {
      // DP-206: Clipboard API with graceful fallback
      await navigator.clipboard.writeText(listingUrl);
      setCopySuccess(true);
      // Reset feedback after 2 seconds
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // Fallback: create temporary textarea, copy, and remove
      const textarea = document.createElement("textarea");
      textarea.value = listingUrl;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch {
        // Silent failure — no error toast per D-124 calm principle
      }
      document.body.removeChild(textarea);
    }
  };

  return (
    <div className="flex gap-2">
      {/* DP-207: WhatsApp share button next to other CTAs */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 inline-flex items-center justify-center gap-2 bg-green-500 text-white font-medium text-sm h-10 rounded-lg hover:bg-green-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 transition-colors"
        aria-label="Share on WhatsApp"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a9.87 9.87 0 00-4.855 1.534c-.356.192-.656.48-.897.787-1.396 1.762-1.781 4.126-.67 6.375 1.111 2.249 3.331 3.683 5.785 3.683 1.52 0 2.956-.608 4.031-1.711l.42-.52c.211-.262.37-.524.477-.799.237-.613.289-1.35.15-2.059-.138-.708-.52-1.331-1.028-1.772-.508-.44-1.152-.784-1.815-.99-.663-.205-1.343-.26-2.018-.169z" />
        </svg>
        Share on WhatsApp
      </a>

      {/* Copy link button with feedback */}
      <button
        type="button"
        onClick={handleCopyLink}
        className="flex-1 inline-flex items-center justify-center gap-2 bg-neutral-100 text-ink font-medium text-sm h-10 rounded-lg hover:bg-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 transition-colors"
        aria-label={copySuccess ? "Link copied" : "Copy link"}
      >
        {copySuccess ? (
          <>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Copied
          </>
        ) : (
          <>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
            Copy link
          </>
        )}
      </button>
    </div>
  );
}
