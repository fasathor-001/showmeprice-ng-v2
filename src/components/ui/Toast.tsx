"use client";

import { useEffect, useState } from "react";
import type { ToastVariant } from "@/lib/toasts";

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
  onDismiss?: () => void;
}

const variantStyles: Record<
  ToastVariant,
  { bg: string; border: string; text: string; icon: () => JSX.Element }
> = {
  success: {
    bg: "bg-verified-bg",
    border: "border-verified/30",
    text: "text-verified-text",
    icon: () => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <path d="m9 11 3 3L22 4" />
      </svg>
    ),
  },
  info: {
    bg: "bg-teal-50",
    border: "border-teal-200",
    text: "text-teal-900",
    icon: () => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
    ),
  },
  warning: {
    bg: "bg-warning-bg",
    border: "border-warning/30",
    text: "text-warning-text",
    icon: () => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    ),
  },
  danger: {
    bg: "bg-danger-bg",
    border: "border-danger/30",
    text: "text-danger-text",
    icon: () => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="m15 9-6 6M9 9l6 6" />
      </svg>
    ),
  },
};

export function Toast({
  message,
  variant = "success",
  durationMs = 7000,
  onDismiss,
}: ToastProps) {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (durationMs === 0) return; // 0 = persistent, no auto-dismiss
    const timer = setTimeout(() => {
      setLeaving(true);
      // Wait for the fade-out transition before unmounting.
      setTimeout(() => {
        setVisible(false);
        onDismiss?.();
      }, 200);
    }, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onDismiss]);

  const handleDismiss = () => {
    setLeaving(true);
    setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 200);
  };

  if (!visible) return null;

  const styles = variantStyles[variant];
  const Icon = styles.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-4 inset-x-4 sm:top-6 sm:right-6 sm:inset-x-auto sm:max-w-sm z-50 transition-opacity duration-200 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      <div
        className={`flex items-start gap-3 ${styles.bg} border ${styles.border} ${styles.text} rounded-xl shadow-cardHover px-4 py-3`}
      >
        <span className="shrink-0 mt-0.5">
          <Icon />
        </span>
        <p className="flex-1 text-sm font-medium">{message}</p>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss notification"
          className={`shrink-0 -m-1 p-1 rounded ${styles.text} opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
