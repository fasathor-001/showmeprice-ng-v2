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
      "Your seller account is ready. Post your first listing to get started.",
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
};

export function getToastMessage(
  key: string | null | undefined
): ToastMessage | null {
  if (!key) return null;
  return toastMessages[key] ?? null;
}
