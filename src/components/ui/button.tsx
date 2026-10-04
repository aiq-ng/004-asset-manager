import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const BASE =
  "relative inline-flex shrink-0 items-center justify-center gap-c54-2 rounded-c54-button font-c54-medium whitespace-nowrap " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-c54-fast ease-c54-out select-none " +
  "disabled:pointer-events-none disabled:opacity-45 active:not-disabled:translate-y-px cursor-pointer";

const VARIANTS: Record<ButtonVariant, string> = {
  // The inset highlight stands in for a light source above the control, which is
  // what stops a saturated fill from reading as a flat sticker.
  primary:
    "bg-c54-action-primary text-c54-action-primary-fg shadow-c54-xs ring-1 ring-c54-action-primary/60 ring-inset " +
    "hover:bg-c54-action-primary-hover hover:shadow-c54-sm",
  secondary:
    "bg-c54-bg-muted text-c54-text-primary border border-c54-border-default shadow-c54-xs hover:border-c54-border-strong hover:bg-c54-bg-elevated",
  outline:
    "border border-c54-border-default bg-transparent text-c54-text-primary hover:bg-c54-action-ghost-hover hover:border-c54-border-strong",
  ghost: "bg-transparent text-c54-text-secondary hover:bg-c54-action-ghost-hover hover:text-c54-text-primary",
  danger:
    "bg-c54-action-danger text-c54-action-danger-fg shadow-c54-xs ring-1 ring-c54-action-danger/60 ring-inset hover:bg-c54-action-danger-hover hover:shadow-c54-sm",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-c54-3 text-c54-xs",
  md: "h-9 px-c54-4 text-c54-sm",
  lg: "h-11 px-c54-6 text-c54-base",
  icon: "size-9",
  "icon-sm": "size-7",
};

/**
 * Spinner diameter per button size, in pixels.
 *
 * `ClipLoader` sizes itself in px, so it cannot read the button's height token;
 * these track it instead — ~70% of the control, which leaves the `gap-c54-2`
 * breathing room on either side instead of crowding the label.
 */
const SPINNER_SIZES: Record<ButtonSize, number> = {
  sm: 12,
  md: 14,
  lg: 16,
  icon: 14,
  "icon-sm": 12,
};

export function buttonClassName(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction. Prefer this over disabling by hand. */
  loading?: boolean;
  fullWidth?: boolean;
}

/**
 * Presentational button. It carries no `"use client"` directive on purpose so a
 * Server Component can render it; interactive use (onClick, formAction) belongs
 * to Client Components, which pull it into their own module graph.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClassName(variant, size, cn(fullWidth && "w-full", className))}
      {...rest}
    >
      {loading ? <Spinner size={SPINNER_SIZES[size]} /> : null}
      {children}
    </button>
  );
}
