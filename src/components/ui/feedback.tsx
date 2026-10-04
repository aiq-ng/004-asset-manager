import { CircleX, Info, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils/cn";

export function Skeleton({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-c54-sm bg-c54-bg-muted",
        "bg-[linear-gradient(90deg,var(--c54-color-bg-muted)_0%,var(--c54-color-border-default)_50%,var(--c54-color-bg-muted)_100%)]",
        "bg-[length:200%_100%]",
        className,
      )}
      aria-hidden="true"
      {...rest}
    />
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-c54-3 px-c54-pad-lg py-c54-12 text-center",
        className,
      )}
    >
      {icon ? (
        // The ring rather than a solid fill: at this size a filled tile competes
        // with the page title, and an outlined one stays a background detail.
        <span className="flex size-11 items-center justify-center rounded-c54-card border border-c54-border-default bg-c54-bg-muted/60 text-c54-text-muted">
          {icon}
        </span>
      ) : null}
      <div className="max-w-sm space-y-c54-1">
        <p className="text-c54-base font-c54-semibold text-c54-text-primary">{title}</p>
        {description ? (
          <p className="text-c54-sm leading-c54-relaxed text-c54-text-secondary">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-c54-1">{action}</div> : null}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-c54-border-accent bg-c54-bg-accent text-c54-text-accent",
    success: "border-transparent bg-c54-bg-success text-c54-text-success",
    warning: "border-transparent bg-c54-bg-warning text-c54-text-warning",
    danger: "border-c54-border-danger bg-c54-bg-danger text-c54-text-danger",
  } as const;

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex gap-c54-3 rounded-c54-card border px-c54-pad py-c54-3 text-c54-xs",
        tones[tone],
        className,
      )}
    >
      <span aria-hidden="true" className="mt-px shrink-0">
        {tone === "danger" ? <ErrorIcon /> : tone === "warning" ? <WarnIcon /> : <InfoIcon />}
      </span>
      <div className="min-w-0 space-y-c54-1">
        {title ? <p className="font-c54-semibold">{title}</p> : null}
        {children ? <div className="text-c54-text-secondary">{children}</div> : null}
      </div>
    </div>
  );
}

function InfoIcon() {
  return <Info aria-hidden="true" className="size-4" />;
}

function WarnIcon() {
  return <TriangleAlert aria-hidden="true" className="size-4" />;
}

function ErrorIcon() {
  return <CircleX aria-hidden="true" className="size-4" />;
}
