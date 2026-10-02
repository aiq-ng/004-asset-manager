import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Submit button for a `<form action={serverAction}>`.
 *
 * `useFormStatus` only sees the enclosing `<form>`, so this has to live in its
 * own component rather than inside the form component itself. The pending state
 * is free — no lifted state, no callbacks threaded through the tree.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: Omit<ButtonProps, "loading" | "type"> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" loading={pending} disabled={props.disabled || pending} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
