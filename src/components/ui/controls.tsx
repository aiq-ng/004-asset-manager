import type { RefAttributes } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * Form control styling shared by every input-like element, so a text field, a
 * select and a textarea line up pixel for pixel.
 *
 * Focus here is a border-colour change plus a soft ring rather than the app-wide
 * outline: a hard 2px outline on a 36px-tall field reads as an error state, and
 * the ring keeps the field's own geometry legible. The global `:focus-visible`
 * rule is still what catches everything that is not a control.
 */
export const CONTROL_BASE =
  "w-full rounded-c54-input border border-c54-border-default bg-c54-bg-card text-c54-sm text-c54-text-primary " +
  "placeholder:text-c54-text-muted transition-[border-color,box-shadow] duration-c54-fast ease-out " +
  "hover:border-c54-border-strong focus:border-c54-action-primary focus:outline-none " +
  "focus:ring-2 focus:ring-c54-action-primary/25 disabled:cursor-not-allowed disabled:bg-c54-bg-muted disabled:text-c54-text-muted";

/**
 * Error styling for a control.
 *
 * Written as `[&[aria-invalid=true]]` rather than a plain `border-c54-*` class
 * because `CONTROL_BASE` already sets `border-c54-border-default` and the two
 * are equal-specificity `border-color` utilities. Which one wins is decided by
 * their order in the *generated stylesheet*, not by the order they are passed to
 * `cn()` — and Tailwind emits `border-default` after `border-danger`, so the
 * plain version silently lost and no invalid control ever showed a red border.
 * The attribute variant compiles to a two-selector rule that outranks a single
 * class, so the error state wins on specificity instead of on a coincidence of
 * stylesheet order that a Tailwind upgrade could undo.
 *
 * Every control that applies this also sets `aria-invalid`, so the styling and
 * the announced state cannot come apart.
 */
export const CONTROL_INVALID =
  "[&[aria-invalid=true]]:border-c54-border-danger " +
  "[&[aria-invalid=true]]:focus:border-c54-action-danger " +
  "[&[aria-invalid=true]]:focus:ring-c54-action-danger/25";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    /**
     * `ref` is accepted explicitly for the same reason it is on `Checkbox`: some
     * callers need the element itself rather than its value — focusing the next
     * field of a repeating entry, for instance, which cannot be done from the
     * React tree alone.
     */
    RefAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Rendered inside the field, on the right. */
  trailing?: React.ReactNode;
}

export function Input({ className, invalid, trailing, ...rest }: InputProps) {
  const control = (
    <input
      className={cn(
        CONTROL_BASE,
        "h-9 px-c54-3",
        invalid && CONTROL_INVALID,
        trailing ? "pr-10" : null,
        className,
      )}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );

  if (!trailing) return control;

  return (
    <div className="relative">
      {control}
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-c54-3 text-c54-text-muted">
        {trailing}
      </div>
    </div>
  );
}

export function Textarea({
  className,
  invalid,
  rows = 3,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      rows={rows}
      className={cn(CONTROL_BASE, "resize-y px-c54-3 py-c54-2 leading-c54-normal", invalid && CONTROL_INVALID, className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Select({
  className,
  invalid,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        className={cn(
          CONTROL_BASE,
          "h-9 cursor-pointer appearance-none py-0 pr-c54-8 pl-c54-3",
          invalid && CONTROL_INVALID,
          className,
        )}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-c54-3 size-3.5 -translate-y-1/2 text-c54-text-muted" />
    </div>
  );
}

/**
 * `ref` is accepted explicitly because a checkbox sometimes needs the element
 * itself rather than its state: `indeterminate` is a DOM property with no
 * attribute form, so a "select all" control over a partially selected list can
 * only set it by holding the node.
 */
export function Checkbox({
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-4 shrink-0 cursor-pointer appearance-none rounded-c54-sm border border-c54-border-strong bg-c54-bg-card",
        "checked:border-c54-action-primary checked:bg-c54-action-primary",
        "checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M3.5%208.5l3%203%206-6.5%22%2F%3E%3C%2Fsvg%3E')]",
        "checked:bg-[length:100%] checked:bg-center checked:bg-no-repeat",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-c54-action-primary",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      {...rest}
    />
  );
}

export function ChevronDownIcon({ className }: { className?: string }) {
  return <ChevronDown aria-hidden="true" className={cn("size-4", className)} />;
}
