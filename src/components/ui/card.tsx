import { cn } from "@/lib/utils/cn";

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-c54-card border border-c54-border-default bg-c54-bg-card shadow-c54-xs",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-c54-3 border-b border-c54-border-default bg-c54-bg-muted/40 px-c54-pad-lg py-c54-3",
        className,
      )}
      {...rest}
    />
  );
}

export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  // The heading reset in @layer base sets `font-weight: 800` on every h1-h4,
  // which is the right call for a page title and the wrong one for a card
  // heading sitting above body text. Card titles are pulled back a step.
  return <h2 className={cn("text-c54-base font-c54-semibold text-c54-text-primary", className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-c54-1 text-c54-xs text-c54-text-secondary", className)} {...rest} />;
}

export function CardContent({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-c54-pad-lg py-c54-pad", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-c54-2 border-t border-c54-border-default bg-c54-bg-muted/40 px-c54-pad-lg py-c54-3",
        className,
      )}
      {...rest}
    />
  );
}

/** A labelled metric. Used across the dashboard summary row. */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  icon?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "text-c54-text-primary",
    accent: "text-c54-text-accent",
    success: "text-c54-text-success",
    warning: "text-c54-text-warning",
    danger: "text-c54-text-danger",
  } as const;

  return (
    <Card className={cn("flex flex-col justify-between gap-c54-2 p-c54-pad-lg", className)}>
      <div className="flex items-center justify-between gap-c54-2">
        <p className="text-c54-2xs font-c54-semibold tracking-c54-widest text-c54-text-secondary uppercase">
          {label}
        </p>
        {icon ? <span className={cn("text-c54-text-muted", tones[tone])}>{icon}</span> : null}
      </div>
      {/* Mono for the digits, not for the whole tile: these are read as figures
          to compare down a column, and tabular lining keeps them aligned. */}
      <p className={cn("font-c54-mono text-c54-3xl leading-c54-tight font-semibold tabular-nums", tones[tone])}>
        {value}
      </p>
      {hint ? <p className="text-c54-xs text-c54-text-muted">{hint}</p> : null}
    </Card>
  );
}
