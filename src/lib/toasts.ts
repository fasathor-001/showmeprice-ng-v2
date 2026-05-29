/**
 * Toast message registry.
 *
 * Pages with success/info moments redirect to ?toast=<key>. The receiving page
 * reads the key and renders the corresponding toast. This prevents arbitrary text
 * injection through query parameters — only known keys produce toasts.
 */

export type ToastVariant = "success" | "info" | "warning" | "danger";

export interface ToastMessage {
  variant: ToastVariant;
  message: string;
}

export const toastMessages: Record<string, ToastMessage> = {
  "password-updated": {
    variant: "success",
    message: "Your password has been updated.",
  },
  "seller-account-created": {
    variant: "success",
    message:
      "Your seller account is ready. Verify your business below to start listing.",
  },
  "seller-account-created-whatsapp-pending": {
    variant: "warning",
    message:
      "Your seller account is ready, but we couldn't verify your WhatsApp number. Buyers can't reach you on it until verification completes — you can finish that step later.",
  },
  "listing-created": {
    variant: "success",
    message: "Your listing is live.",
  },
  "listing-updated": {
    variant: "success",
    message: "Your listing has been updated.",
  },
  "listing-deleted": {
    variant: "info",
    message: "Listing deleted.",
  },
  "listing-marked-sold": {
    variant: "success",
    message: "Listing marked as sold. It's now hidden from buyer search.",
  },
  "listing-reactivated": {
    variant: "success",
    message: "Listing reactivated. It's back in buyer search.",
  },
  "signup-business-failed": {
    variant: "warning",
    message:
      "Your account was created but we couldn't set up your business. Please try again below.",
  },
  "business-updated": {
    variant: "success",
    message: "Business updated successfully.",
  },
  "phone-verified": {
    variant: "success",
    message: "Your phone number is verified.",
  },
  "verification-approved": {
    variant: "success",
    message: "Seller approved. Their listings are now live.",
  },
  "verification-rejected": {
    variant: "info",
    message: "Submission rejected with feedback to seller.",
  },
  "report-resolved": {
    variant: "success",
    message: "Report resolved.",
  },
  "report-dismissed": {
    variant: "info",
    message: "Report dismissed.",
  },
  "report-in-review": {
    variant: "info",
    message: "Report marked under review.",
  },
  "listing-hidden": {
    variant: "warning",
    message: "Listing hidden from public view.",
  },
  "listing-unhidden": {
    variant: "info",
    message: "Listing restored to public view.",
  },
  "verify-needs-business-details": {
    variant: "warning",
    message:
      "Before you can verify your account, complete your business details below (city / area, state).",
  },
  "phone-changed": {
    variant: "success",
    message: "Phone number changed. Verification was revoked.",
  },
  "phone-unchanged": {
    variant: "info",
    message: "Phone number is already that value — no change made.",
  },
  "location-changed": {
    variant: "success",
    message: "Location updated.",
  },
  "location-unchanged": {
    variant: "info",
    message: "Location is already that value — no change made.",
  },
  "marked-sold-out": {
    variant: "info",
    message:
      "Listing marked as sold out. Buyers will see 'Out of stock' on the listing.",
  },
  "marked-available": {
    variant: "success",
    message:
      "Listing marked as available. Quantity set to 1 — edit to update if you have multiples.",
  },
  "verify-needs-whatsapp": {
    variant: "warning",
    message:
      "Before you can verify your account, verify your WhatsApp number using the banner above.",
  },
};

export function getToastMessage(
  key: string | null | undefined
): ToastMessage | null {
  if (!key) return null;
  return toastMessages[key] ?? null;
}
