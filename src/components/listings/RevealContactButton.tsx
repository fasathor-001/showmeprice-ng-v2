"use client";

// Feature N slice 3 — buyer-facing WhatsApp reveal CTA.
//
// Mounts directly BENEATH MessageSellerButton on the listing detail page.
// Position is LOCKED:
//   - Messaging stays PRIMARY (filled teal button, dual-mount sticky on mobile).
//   - Reveal is SECONDARY (outline button stacked beneath on desktop; in
//     document flow on mobile so it doesn't compete with the sticky bar).
//
// Wraps revealSellerContactAction (slice 2 / src/lib/reveals/actions.ts).
// The action's discriminated union (RevealContactResult) drives the rendered
// state — the union variants make the whatsapp field statically absent on
// every non-reveal branch, so this component can never accidentally render a
// phone number it didn't legitimately receive.
//
// Visible states:
//   - OWN LISTING                 → render nothing (mirrors MessageSellerButton).
//   - NOT SIGNED IN               → outline link to /sign-in?next=
//   - DEFAULT (has reveals)       → outline "Reveal WhatsApp contact" + count
//   - LOADING                     → disabled outline button, "Revealing…" label
//   - REVEALED / ALREADY_REVEALED → number panel + "Open WhatsApp" link (wa.me)
//   - NO_REVEALS_REMAINING        → disabled outline button + locked Option-B copy
//   - SELLER UNAVAILABLE / NO WA  → render nothing (messaging still reachable)
//   - SELF_REVEAL / INVALID / AUTH/SUSPENDED / UNKNOWN_ERROR → soft error +
//                                   retry button (defensive; should not normally
//                                   fire because own-listing is hidden up front).
//
// SECURITY: the whatsapp number renders ONLY from the action's `revealed` or
// `already_revealed` result variants. It is never derived from any other source
// in the DOM, never present before a successful reveal, never written to a URL
// or attribute except inside the wa.me link below.

import Link from "next/link";
import { useState, useTransition } from "react";
import { revealSellerContactAction } from "@/lib/reveals/actions";
import type { RevealContactResult } from "@/lib/reveals/types";

interface RevealContactButtonProps {
  sellerId: string;
  listingId: string;
  userId: string | null;
  isOwnListing: boolean;
  /**
   * Page-fetched starting count, so the buyer sees "N free reveals available"
   * before any interaction. NULL when not available (signed-out or buyer
   * profile read failed). Once a reveal call returns, the post-call count
   * from the action result takes precedence.
   */
  initialFreeRevealsRemaining: number | null;
  /**
   * Used to prefill the WhatsApp message text once a number is revealed.
   */
  listingTitle: string;
}

const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center justify-center w-full bg-teal-600 text-white font-medium text-base h-12 rounded-lg hover:bg-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 transition-colors";

const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center w-full bg-white text-ink border border-neutral-300 font-medium text-base h-12 rounded-lg hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white";

const HELPER_TEXT_CLASS = "mt-1.5 text-xs text-ink-600 text-center";

function formatRemaining(n: number): string {
  if (n <= 0) return "You've used your 3 free WhatsApp reveals.";
  return `${n} free reveal${n === 1 ? "" : "s"} available`;
}

export function RevealContactButton({
  sellerId,
  listingId,
  userId,
  isOwnListing,
  initialFreeRevealsRemaining,
  listingTitle,
}: RevealContactButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<RevealContactResult | null>(null);

  // OWN LISTING — render nothing (mirror MessageSellerButton D-121 rule).
  if (isOwnListing) return null;

  // Authoritative count: action result if we have one, else page-supplied.
  const remaining: number | null =
    result !== null && "freeRevealsRemaining" in result
      ? result.freeRevealsRemaining
      : initialFreeRevealsRemaining;

  // NOT SIGNED IN — outline link to sign-in (mirrors message state 1 style,
  // but as a secondary, outline CTA to keep messaging visually primary).
  if (!userId) {
    return (
      <div className="mt-3">
        <Link
          href={`/sign-in?next=/listings/${listingId}`}
          className={SECONDARY_BUTTON_CLASS}
        >
          Sign in to reveal WhatsApp contact
        </Link>
      </div>
    );
  }

  function handleReveal() {
    startTransition(async () => {
      const res = await revealSellerContactAction(sellerId, listingId);
      setResult(res);
    });
  }

  // REVEAL SUCCESS — render the number + Open WhatsApp CTA.
  if (
    result !== null &&
    (result.status === "revealed" || result.status === "already_revealed")
  ) {
    const prefill = encodeURIComponent(
      `Hi! I saw your listing "${listingTitle}" on ShowMePrice and I'm interested.`,
    );
    // wa.me wants digits only (no '+'). Our stored value is already E.164
    // without the leading '+', so it's drop-in.
    const waUrl = `https://wa.me/${result.whatsapp}?text=${prefill}`;
    const subhead =
      result.status === "already_revealed"
        ? "You've already revealed this seller — no extra reveal used."
        : "Tell the seller you found them on ShowMePrice.";
    return (
      <div className="mt-3" aria-live="polite">
        <div className="rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-3 mb-2">
          <p className="text-xs text-ink-600">Seller&apos;s WhatsApp</p>
          <p className="text-lg font-medium text-ink tabular-nums">
            +{result.whatsapp}
          </p>
          <p className="text-xs text-ink-600 mt-1">{subhead}</p>
        </div>
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={PRIMARY_BUTTON_CLASS}
        >
          Open WhatsApp
        </a>
        {typeof remaining === "number" && (
          <p className={HELPER_TEXT_CLASS}>{formatRemaining(remaining)}</p>
        )}
      </div>
    );
  }

  // NO REVEALS LEFT — disabled outline + locked Option-B copy. Messaging is
  // the sibling button above (or the sticky mobile bar) and stays reachable.
  if (result !== null && result.status === "no_reveals_remaining") {
    return (
      <div className="mt-3" aria-live="polite">
        <button
          type="button"
          disabled
          className={SECONDARY_BUTTON_CLASS}
          aria-disabled="true"
        >
          Reveal WhatsApp contact
        </button>
        <p className={HELPER_TEXT_CLASS}>
          You&apos;ve used your 3 free WhatsApp reveals. Continue with Message
          seller.
        </p>
      </div>
    );
  }

  // SELLER UNAVAILABLE / SELLER HAS NO VERIFIED WA — hide entirely. Messaging
  // remains the path. Per directive: no error scream.
  if (
    result !== null &&
    (result.status === "seller_unavailable" ||
      result.status === "seller_whatsapp_not_available")
  ) {
    return null;
  }

  // SOFT-ERROR STATES — defensive (self_reveal should be impossible because
  // own-listing is hidden up front; auth/suspended would normally be caught
  // before this UI renders; invalid_input/unknown_error indicates a bug or
  // transient). Show a graceful retry without leaking which case it was.
  if (
    result !== null &&
    (result.status === "self_reveal" ||
      result.status === "invalid_input" ||
      result.status === "unauthenticated" ||
      result.status === "suspended" ||
      result.status === "unknown_error")
  ) {
    return (
      <div className="mt-3" aria-live="polite">
        <button
          type="button"
          onClick={handleReveal}
          disabled={isPending}
          className={SECONDARY_BUTTON_CLASS}
          aria-busy={isPending}
        >
          {isPending ? "Revealing…" : "Try again"}
        </button>
        <p className="mt-1.5 text-xs text-danger-text text-center">
          Couldn&apos;t reveal contact right now. You can still message the
          seller above.
        </p>
      </div>
    );
  }

  // DEFAULT — ready to reveal (covers initial state and loading).
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleReveal}
        disabled={isPending}
        className={SECONDARY_BUTTON_CLASS}
        aria-busy={isPending}
      >
        {isPending ? "Revealing…" : "Reveal WhatsApp contact"}
      </button>
      {typeof remaining === "number" && (
        <p className={HELPER_TEXT_CLASS}>{formatRemaining(remaining)}</p>
      )}
    </div>
  );
}
