import { cn } from "@/lib/utils/cn";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "inverse";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-c54-bg-muted text-c54-text-secondary border-c54-border-default",
  accent: "bg-c54-bg-accent text-c54-text-accent border-c54-border-accent",
  success: "bg-c54-bg-success text-c54-text-success border-transparent",
  warning: "bg-c54-bg-warning text-c54-text-warning border-transparent",
  danger: "bg-c54-bg-danger text-c54-text-danger border-c54-border-danger",
  info: "bg-c54-bg-muted text-c54-text-primary border-c54-border-strong",
  inverse: "bg-c54-text-primary text-c54-bg-card border-transparent",
};

const DOT_TONES: Record<BadgeTone, string> = {
  neutral: "bg-c54-text-muted",
  accent: "bg-c54-text-accent",
  success: "bg-c54-status-healthy",
  warning: "bg-c54-text-warning",
  danger: "bg-c54-action-danger",
  info: "bg-c54-text-primary",
  inverse: "bg-c54-bg-card",
};

export function Badge({
  tone = "neutral",
  dot,
  size = "md",
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  /** Leading status dot — the fastest signal in a dense table. */
  dot?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-c54-2 rounded-c54-pill border font-c54-medium whitespace-nowrap",
        size === "sm" ? "px-c54-2 py-px text-c54-2xs" : "px-c54-3 py-0.5 text-c54-xs",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {dot ? <span className={cn("size-1.5 rounded-c54-full", DOT_TONES[tone])} /> : null}
      {children}
    </span>
  );
}

/** Monospace identifier chip, e.g. `IT-LAP-0001` or a cuid. */
export function CodeChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <code
      className={cn(
        "inline-flex items-center rounded-c54-sm border border-c54-border-default bg-c54-bg-muted px-c54-2 py-px",
        "font-c54-mono text-c54-xs tracking-c54-wide text-c54-text-primary",
        className,
      )}
    >
      {children}
    </code>
  );
}
