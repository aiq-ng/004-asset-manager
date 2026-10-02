import { cn } from "@/lib/utils/cn";

/**
 * Data grid.
 *
 * The table is wrapped in a horizontally scrollable shell so wide columns
 * degrade gracefully on narrow viewports instead of forcing the whole page to
 * scroll.
 *
 * `sticky` exists because sticky positioning needs a scrollport to stick inside,
 * and `overflow-x: auto` already makes this wrapper one — vertically included,
 * since a non-visible overflow on one axis forces the other to `auto` too. So
 * the header cannot pin to the viewport from in here. Pinning it *inside* the
 * shell instead means bounding the shell's height, and `sticky` does that with a
 * cap generous enough that short lists never overflow and so never change
 * behaviour: no inner scrollbar, no swallowed wheel.
 */
export function Table({
  className,
  sticky = false,
  scrollClassName,
  ...rest
}: React.TableHTMLAttributes<HTMLTableElement> & {
  /** Bound the height and pin the header. See the note above. */
  sticky?: boolean;
  scrollClassName?: string;
}) {
  return (
    <div className={cn("w-full overflow-x-auto", sticky && "max-h-[min(80dvh,56rem)]", scrollClassName)}>
      <table className={cn("c54-data-table", className)} {...rest} />
    </div>
  );
}

export function TableHead({ className, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-c54-border-default", className)} {...rest} />;
}

export function TableBody({ className, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&>tr:last-child>td]:border-b-0", className)} {...rest} />;
}

export function TableRow({ className, ...rest }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "transition-colors duration-c54-fast hover:bg-c54-action-ghost-hover",
        "data-[state=selected=true]:bg-c54-bg-accent",
        className,
      )}
      {...rest}
    />
  );
}

export function TableHeader({ className, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn("px-c54-3 py-c54-2 first:pl-c54-pad-lg last:pr-c54-pad-lg", className)}
      {...rest}
    />
  );
}

export function TableCell({ className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-c54-3 py-c54-2 text-c54-sm first:pl-c54-pad-lg last:pr-c54-pad-lg", className)} {...rest} />
  );
}

export function TableCaption({ className, ...rest }: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={cn("sr-only", className)} {...rest} />;
}

/** A definition list, for the read-only detail panels. */
export function DescriptionList({ className, ...rest }: React.HTMLAttributes<HTMLDListElement>) {
  return <dl className={cn("grid grid-cols-1 gap-x-c54-6 gap-y-c54-3 sm:grid-cols-2", className)} {...rest} />;
}

/** One term/value pair. Use inside a `DescriptionList`. */
export function DetailRow({
  term,
  children,
  className,
}: {
  term: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-c54-1", className)}>
      <dt className="text-c54-2xs font-c54-semibold tracking-c54-widest text-c54-text-muted uppercase">
        {term}
      </dt>
      <dd className="text-c54-sm break-words text-c54-text-primary">{children}</dd>
    </div>
  );
}
