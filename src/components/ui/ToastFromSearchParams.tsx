"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Toast } from "./Toast";
import { getToastMessage } from "@/lib/toasts";

export function ToastFromSearchParams() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toastKey = searchParams.get("toast");
  const [shown, setShown] = useState(false);

  // Strip the toast param from URL after rendering so refresh doesn't re-show it.
  useEffect(() => {
    if (toastKey && !shown) {
      setShown(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("toast");
      const newQuery = params.toString();
      const newUrl = newQuery ? `${pathname}?${newQuery}` : pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [toastKey, shown, searchParams, router, pathname]);

  const toast = getToastMessage(toastKey);
  if (!toast) return null;

  return <Toast message={toast.message} variant={toast.variant} />;
}
