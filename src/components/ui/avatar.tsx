import { cn } from "@/lib/utils/cn";
import { initialsOf } from "@/lib/utils/format";

const SIZES = {
  sm: "size-6 text-c54-2xs",
  md: "size-8 text-c54-xs",
  lg: "size-11 text-c54-sm",
} as const;

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-c54-full bg-c54-bg-muted font-c54-mono font-semibold text-c54-text-secondary",
        "ring-1 ring-c54-border-default ring-inset select-none",
        SIZES[size],
        className,
      )}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}
