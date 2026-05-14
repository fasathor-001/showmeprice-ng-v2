import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ leftIcon, rightSlot, error, className = "", ...props }, ref) => {
    const base =
      "flex items-center w-full bg-white border rounded-lg transition-colors " +
      "focus-within:ring-2 focus-within:ring-teal-400 focus-within:ring-offset-1 " +
      (error
        ? "border-danger focus-within:ring-danger"
        : "border-neutral-300 focus-within:border-teal-600");

    return (
      <div>
        <div className={`${base} ${className}`}>
          {leftIcon && (
            <span className="pl-3 inline-flex text-neutral-400 shrink-0">{leftIcon}</span>
          )}
          <input
            ref={ref}
            className="flex-1 bg-transparent border-0 outline-none text-base text-ink placeholder:text-neutral-400 px-3 py-2.5"
            {...props}
          />
          {rightSlot && <span className="pr-1 shrink-0">{rightSlot}</span>}
        </div>
        {error && <p className="text-xs text-danger mt-1.5">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
