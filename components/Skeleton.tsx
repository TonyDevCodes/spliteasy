type SkeletonProps = {
  className?: string;
};

// Placeholder block shown while data loads. Size it through className.
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`skeleton rounded-lg bg-border ${className}`}
    />
  );
}
