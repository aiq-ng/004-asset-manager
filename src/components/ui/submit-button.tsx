import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Submit button for a `<form action={serverAction}>`.
 *
 * ## Why `pending` exists alongside `useFormStatus`
 *
 * `useFormStatus` only sees a form it is a *React descendant* of. In the
 * inline forms (login, asset edit) the button is inside the `<form>` and the
 * hook is enough. In a sheet it is not: the `<form>` is rendered in the panel
 * body while this button sits in the dialog `footer`, as a sibling. The
 * `form="..."` attribute associates the DOM control with the form for
 * submission, but it does not put the button inside React's form context — so
 * `useFormStatus` there always reports `pending: false`, and the button would
 * never show its spinner or disable.
 *
 * The hook is still read, because it is correct where it applies and costs
 * nothing; `pending` overrides it when given. Callers that render a submit
 * control outside their own `<form>` must pass it — the value is the third
 * element of `useActionState`, which is derived from the same transition the
 * dispatch triggers and so is not context-bound.
 */
export function SubmitButton({
  children,
  pendingLabel,
  pending,
  ...props
}: Omit<ButtonProps, "loading" | "type"> & { pendingLabel?: string; pending?: boolean }) {
  const { pending: formPending } = useFormStatus();
  const busy = pending ?? formPending;

  return (
    // `{...props}` first, deliberately: spread last would let a caller's
    // `disabled` overwrite the computed one and defeat the lock — which is how
    // an upload button stayed clickable while its request was in flight.
    <Button {...props} type="submit" loading={busy} disabled={props.disabled || busy}>
      {busy && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
