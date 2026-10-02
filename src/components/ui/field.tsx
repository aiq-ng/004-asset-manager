import { cn } from "@/lib/utils/cn";

/**
 * Label + control + hint/error wrapper.
 *
 * The control is passed as a render function so this can stay a Server
 * Component: the caller supplies the actual `<Input>`, and the ids, the
 * `aria-describedby` wiring and the invalid state live in one place.
 */
export interface FieldRenderProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  invalid: boolean;
}

export interface FieldProps {
  label: string;
  htmlFor: string;
  children: (props: FieldRenderProps) => React.ReactNode;
  hint?: string;
  /** Server-side field error, keyed by the Zod issue path. */
  error?: string;
  required?: boolean;
  className?: string;
  /** Rendered at the end of the label row, e.g. a character counter. */
  accessory?: React.ReactNode;
}

export function Field({
  label,
  htmlFor,
  children,
  hint,
  error,
  required,
  className,
  accessory,
}: FieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-c54-1", className)}>
      <div className="flex items-baseline justify-between gap-c54-2">
        <label htmlFor={htmlFor} className="text-c54-xs font-c54-medium text-c54-text-secondary">
          {label}
          {required ? (
            <span className="ml-c54-1 text-c54-text-danger" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
        {accessory}
      </div>

      {children({
        id: htmlFor,
        invalid: Boolean(error),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(error ? { "aria-invalid": true as const } : {}),
      })}

      {error ? (
        <p id={errorId} role="alert" className="text-c54-xs text-c54-text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-c54-2xs text-c54-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
