import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  "aria-label": string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "ghost";
}

const sizeStyles = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-11 h-11",
};

const variantStyles = {
  default: "border border-neutral-300 bg-white hover:bg-neutral-50",
  ghost: "bg-transparent hover:bg-neutral-100",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, size = "md", variant = "ghost", className = "", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-lg text-ink-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 disabled:opacity-50 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";
