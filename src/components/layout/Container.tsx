import { type HTMLAttributes, type ReactNode } from "react";

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  size?: "default" | "narrow";
}

export function Container({
  children,
  size = "default",
  className = "",
  ...props
}: ContainerProps) {
  const maxW = size === "narrow" ? "max-w-3xl" : "max-w-container";
  return (
    <div className={`${maxW} mx-auto px-4 sm:px-6 lg:px-8 ${className}`} {...props}>
      {children}
    </div>
  );
}
