import { type HTMLAttributes, type ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: "default" | "hover";
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingStyles: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
};

export function Card({
  children,
  variant = "default",
  padding = "md",
  className = "",
  ...props
}: CardProps) {
  const base = "bg-white border border-neutral-200 rounded-xl shadow-card";
  const hover =
    variant === "hover" ? "transition-shadow hover:shadow-cardHover" : "";

  return (
    <div className={`${base} ${hover} ${paddingStyles[padding]} ${className}`} {...props}>
      {children}
    </div>
  );
}
