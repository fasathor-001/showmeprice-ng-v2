interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-neutral-200 rounded ${className}`}
      aria-hidden="true"
    />
  );
}
