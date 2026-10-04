import { cn } from "@/lib/utils/cn";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "inverse";

/**
 * A lucide icon component. Typed structurally rather than as lucide's own
 * `LucideIcon` type so a caller can pass any icon component without this module
 * importing the library and the two drifting apart.
 */
export type BadgeIcon = React.ComponentType<{ className?: string }>;

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-c54-bg-muted text-c54-text-secondary border-c54-border-default",
  accent: "bg-c54-bg-accent text-c54-text-accent border-c54-border-accent",
  success: "bg-c54-bg-success text-c54-text-success border-transparent",
  warning: "bg-c54-bg-warning text-c54-text-warning border-transparent",
  danger: "bg-c54-bg-danger text-c54-text-danger border-c54-border-danger",
  info: "bg-c54-bg-muted text-c54-text-primary border-c54-border-strong",
  inverse: "bg-c54-text-primary text-c54-bg-card border-transparent",
};

/**
 * Status pill.
 *
 * Takes an `icon` rather than rendering one of its own, because the useful
 * glyph is not derivable from the tone: `danger` covers "sign in failed",
 * "staff deleted" and "access denied", and those want a different picture. The
 * caller knows which of the three it is, so the caller picks.
 *
 * This replaced a coloured dot. The dot was a tone restated in a smaller circle
 * — it told you a pill was *severe* without telling you what it was about, and
 * it carried no meaning at all in greyscale or with colour vision deficiency.
 * The icon is chosen for meaning; the tone is still there for the fast sweep.
 */
export function Badge({
  tone = "neutral",
  icon: Icon,
  size = "md",
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  /** Leading glyph. Sized to the pill and inherits its colour. */
  icon?: BadgeIcon;
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
      {/* `shrink-0` so the glyph is never the thing that gives way when a long
          label needs the room. */}
      {Icon ? <Icon className={cn("shrink-0", size === "sm" ? "size-3" : "size-3.5")} /> : null}
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