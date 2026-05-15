"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Toast } from "./Toast";
import { getToastMessage, type ToastMessage } from "@/lib/toasts";

/**
 * Reads a ?toast=<key> query parameter on mount, captures the resolved
 * ToastMessage into local state, and strips the param from the URL so
 * a page refresh doesn't re-show the toast.
 *
 * The captured-into-local-state step is load-bearing: a previous version
 * resolved `toast` directly from searchParams on every render, which meant
 * the immediate `router.replace` that strips the param caused the next
 * render to set `toast = null` and unmount the <Toast> before its
 * auto-dismiss timer could run. The visible behavior was a sub-second
 * "flash" rather than the intended multi-second acknowledgment.
 * Phase C.5.6.0.1 fix.
 */
export function ToastFromSearchParams() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [consumed, setConsumed] = useState(false);

  useEffect(() => {
    if (consumed) return;
    const toastKey = searchParams.get("toast");
    const resolved = getToastMessage(toastKey);
    if (!resolved) return;

    setToast(resolved);
    setConsumed(true);

    // Strip the toast param after capturing so a refresh doesn't re-show.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("toast");
    const newQuery = params.toString();
    router.replace(newQuery ? `${pathname}?${newQuery}` : pathname, {
      scroll: false,
    });
  }, [consumed, searchParams, router, pathname]);

  if (!toast) return null;
  return (
    <Toast
      message={toast.message}
      variant={toast.variant}
      onDismiss={() => setToast(null)}
    />
  );
}
