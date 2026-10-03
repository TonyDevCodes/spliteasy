type BrandLogoProps = {
  tagline?: string;
  // "stacked" puts the wordmark below the mark (auth header); "inline" puts it beside the mark.
  layout?: "stacked" | "inline";
  size?: number;
  // "light" renders a white wordmark for dark or coloured backgrounds.
  tone?: "default" | "light";
};

// Full-colour logo mark with the wordmark, used as the brand header.
export function BrandLogo({ tagline, layout = "stacked", size = 96, tone = "default" }: BrandLogoProps) {
  const inline = layout === "inline";
  const wordmarkColor = tone === "light" ? "text-white" : "text-[#0F172A] dark:text-text";

  return (
    <div className={inline ? "flex items-center gap-1" : "flex flex-col items-center gap-1 text-center"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.svg" alt="" width={size} height={size} />
      <span
        className={`font-extrabold tracking-tight ${wordmarkColor} ${inline ? "" : "text-3xl"}`}
        style={inline ? { fontSize: Math.round(size * 0.5) } : undefined}
      >
        SplitEasy
      </span>
      {tagline ? <p className="mt-1 text-sm text-text-muted">{tagline}</p> : null}
    </div>
  );
}
