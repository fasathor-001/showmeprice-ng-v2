import { type HTMLAttributes, type ReactNode } from "react";

type BadgeVariant = "neutral" | "verified" | "warning" | "danger" | "teal";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: ReactNode;
  leftIcon?: ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  neutral: "bg-neutral-100 text-ink-600",
  verified: "bg-verified-bg text-verified-text",
  warning: "bg-warning-bg text-warning-text",
  danger: "bg-danger-bg text-danger-text",
  teal: "bg-teal-50 text-teal-900",
};

export function Badge({
  variant = "neutral",
  children,
  leftIcon,
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {leftIcon && <span className="inline-flex">{leftIcon}</span>}
      {children}
    </span>
  );
}
