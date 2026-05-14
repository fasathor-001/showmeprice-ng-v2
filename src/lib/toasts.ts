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
  // Add new keys here as future flows need them:
  //   "account-created": { variant: "success", message: "Welcome to ShowMePrice!" },
  //   "signed-out": { variant: "info", message: "You've been signed out." },
};

export function getToastMessage(
  key: string | null | undefined
): ToastMessage | null {
  if (!key) return null;
  return toastMessages[key] ?? null;
}
