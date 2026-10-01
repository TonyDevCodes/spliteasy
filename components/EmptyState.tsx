import Link from "next/link";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: { label: string; href: string };
  className?: string;
};

// Built from the logo shapes: a soft disc behind the three slices pulled
// slightly apart, with a few small circles around them.
function Illustration() {
  return (
    <svg
      width={160}
      height={120}
      viewBox="0 0 160 120"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx={80} cy={60} r={54} className="fill-primary" opacity={0.1} />
      <g transform="translate(30 10)">
        <path
          d="M50 50 L50 10 A40 40 0 0 1 84.64 70 Z"
          transform="translate(4.3 -2.5)"
          className="fill-[#4F46E5] dark:fill-[#6D66F2]"
          opacity={0.9}
        />
        <path
          d="M50 50 L84.64 70 A40 40 0 0 1 15.36 70 Z"
          transform="translate(0 5)"
          fill="#FB7185"
          opacity={0.9}
        />
        <path
          d="M50 50 L15.36 70 A40 40 0 0 1 50 10 Z"
          transform="translate(-4.3 -2.5)"
          fill="#2DD4BF"
          opacity={0.9}
        />
      </g>
      <circle cx={22} cy={30} r={6} fill="#FB7185" opacity={0.7} />
      <circle cx={142} cy={92} r={5} fill="#2DD4BF" opacity={0.7} />
      <circle
        cx={138}
        cy={24}
        r={4}
        className="fill-[#4F46E5] dark:fill-[#6D66F2]"
        opacity={0.7}
      />
    </svg>
  );
}

export function EmptyState({ title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center gap-3 px-4 py-8 text-center ${className}`}>
      <Illustration />
      <h2 className="text-lg font-bold text-text">{title}</h2>
      <p className="max-w-xs text-sm text-text-muted">{description}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-2 inline-flex h-12 items-center justify-center rounded-[14px] bg-primary px-6 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
