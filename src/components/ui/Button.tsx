import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-900 focus-visible:ring-teal-400",
  secondary:
    "bg-white text-ink border border-neutral-300 hover:bg-neutral-50 active:bg-neutral-100 focus-visible:ring-teal-400",
  ghost:
    "bg-transparent text-ink hover:bg-neutral-100 active:bg-neutral-200 focus-visible:ring-teal-400",
  danger:
    "bg-danger text-white hover:opacity-90 active:opacity-80 focus-visible:ring-danger",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      children,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className = "",
      ...props
    },
    ref
  ) => {
    const base =
      "inline-flex items-center justify-center font-medium rounded-lg transition-colors " +
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
      "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none";
    const width = fullWidth ? "w-full" : "";

    return (
      <button
        ref={ref}
        className={`${base} ${variantStyles[variant]} ${sizeStyles[size]} ${width} ${className}`}
        {...props}
      >
        {leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";
