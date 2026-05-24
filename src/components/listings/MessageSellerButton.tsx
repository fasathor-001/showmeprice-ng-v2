"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { MessageSellerModal } from "./MessageSellerModal";

// Stage 2.B Commit 7 — entry point for new conversations from real users.
//
// Renders TWO buttons sharing ONE modal:
//   - Inline (desktop, `hidden lg:block`): replaces the old WhatsApp
//     placeholder slot at the bottom of the listing details column.
//   - Sticky-bottom (mobile, `lg:hidden fixed bottom-0`): always visible
//     while scrolling the long listing page on mobile. Jiji / Jumia /
//     WhatsApp Catalog pattern. Mobile-first per D-124.
//
// Five button states (B refinement from surface findings):
//   1. Not signed in            → "Sign in to message seller" (link to /sign-in?next=)
//   2. Signed in, unverified    → "Verify phone to message" (link to /verify-phone?next=)
//   3. Own listing              → hidden entirely (D-121 — no confusing disabled state)
//   4. Existing conversation    → "Continue conversation →" (direct link to /messages/[id])
//   5. Signed in + verified     → "Message seller" (opens modal)
//
// D-124 Tier 1 surface (entry point to messaging). Benchmarked against
// WhatsApp Catalog / Jiji listing-page CTAs.

interface MessageSellerButtonProps {
  listingId: string;
  listingTitle: string;
  listingPriceKobo: number;
  listingPrimaryImageUrl: string | null;
  sellerBusinessName: string;
  userId: string | null;
  isPhoneVerified: boolean;
  isOwnListing: boolean;
  existingConversationId: string | null;
}

const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center justify-center w-full bg-teal-600 text-white font-medium text-base h-12 rounded-lg hover:bg-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 transition-colors";

function StickyMobileWrapper({ children }: { children: ReactNode }) {
  // Mobile-only sticky-bottom action bar. Fixed positioning anchors to
  // viewport bottom regardless of scroll. z-30 above page content; below
  // any future modal overlays (which use z-50).
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-neutral-200 px-4 py-3 shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.06)]">
      {children}
    </div>
  );
}

function InlineWrapper({ children }: { children: ReactNode }) {
  // Desktop-only inline placement. Hidden on mobile (sticky-bottom owns
  // mobile per D-124's one-button-per-viewport simplicity).
  return <div className="hidden lg:block">{children}</div>;
}

export function MessageSellerButton({
  listingId,
  listingTitle,
  listingPriceKobo,
  listingPrimaryImageUrl,
  sellerBusinessName,
  userId,
  isPhoneVerified,
  isOwnListing,
  existingConversationId,
}: MessageSellerButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);

  // State 3: own listing — render nothing. No confusing disabled state per
  // D-121 (hidden > disabled when the action would never apply to this user).
  if (isOwnListing) return null;

  // State 1: signed out.
  if (!userId) {
    const href = `/sign-in?next=/listings/${listingId}`;
    const label = "Sign in to message seller";
    const link = (
      <Link href={href} className={PRIMARY_BUTTON_CLASS}>
        {label}
      </Link>
    );
    return (
      <>
        <InlineWrapper>{link}</InlineWrapper>
        <StickyMobileWrapper>{link}</StickyMobileWrapper>
      </>
    );
  }

  // State 2: signed in but phone-unverified (D-114 gate).
  if (!isPhoneVerified) {
    const href = `/verify-phone?next=/listings/${listingId}`;
    const label = "Verify phone to message";
    const link = (
      <Link href={href} className={PRIMARY_BUTTON_CLASS}>
        {label}
      </Link>
    );
    return (
      <>
        <InlineWrapper>{link}</InlineWrapper>
        <StickyMobileWrapper>{link}</StickyMobileWrapper>
      </>
    );
  }

  // State 4: existing conversation — direct link to the thread (no modal).
  if (existingConversationId) {
    const href = `/messages/${existingConversationId}`;
    const label = "Continue conversation →";
    const link = (
      <Link href={href} className={PRIMARY_BUTTON_CLASS}>
        {label}
      </Link>
    );
    return (
      <>
        <InlineWrapper>{link}</InlineWrapper>
        <StickyMobileWrapper>{link}</StickyMobileWrapper>
      </>
    );
  }

  // State 5: ready — open modal on click.
  const openButton = (
    <button
      type="button"
      onClick={() => setModalOpen(true)}
      className={PRIMARY_BUTTON_CLASS}
      aria-label="Message seller"
    >
      Message seller
    </button>
  );
  return (
    <>
      <InlineWrapper>{openButton}</InlineWrapper>
      <StickyMobileWrapper>{openButton}</StickyMobileWrapper>
      {modalOpen && (
        <MessageSellerModal
          listingId={listingId}
          listingTitle={listingTitle}
          listingPriceKobo={listingPriceKobo}
          listingPrimaryImageUrl={listingPrimaryImageUrl}
          sellerBusinessName={sellerBusinessName}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
