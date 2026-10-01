type LogoProps = {
  size?: number;
  withWordmark?: boolean;
  className?: string;
};

// Three equal slices; the gaps between them are the surface color of the theme.
export function Logo({ size = 28, withWordmark = false, className = "" }: LogoProps) {
  const mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={withWordmark ? undefined : "img"}
      aria-label={withWordmark ? undefined : "SplitEasy"}
      aria-hidden={withWordmark ? true : undefined}
      strokeWidth={3.5}
      strokeLinejoin="round"
      className="stroke-surface"
    >
      <path
        d="M50 50 L50 10 A40 40 0 0 1 84.64 70 Z"
        className="fill-[#4F46E5] dark:fill-[#6D66F2]"
      />
      <path d="M50 50 L84.64 70 A40 40 0 0 1 15.36 70 Z" fill="#FB7185" />
      <path d="M50 50 L15.36 70 A40 40 0 0 1 50 10 Z" fill="#2DD4BF" />
    </svg>
  );

  if (!withWordmark) return <span className={className}>{mark}</span>;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {mark}
      <span
        className="font-extrabold tracking-tight text-text"
        style={{ fontSize: Math.round(size * 0.72) }}
      >
        Split<span className="text-link">Easy</span>
      </span>
    </span>
  );
}
