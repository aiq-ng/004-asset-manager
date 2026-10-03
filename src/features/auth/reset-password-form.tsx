"use client";

import Link from "next/link";
import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/controls";
import { Alert } from "@/components/ui/feedback";
import { resetPasswordAction } from "@/features/auth/actions";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";
import { PASSWORD_REQUIREMENT } from "@/lib/auth/password-policy";

/**
 * Set a new password from the email link.
 *
 * The token arrives in the URL (`?token=…`) and is carried through as a hidden
 * field, so the POST the form makes is the only thing that ever needs to keep
 * it — it never sits in `localStorage` or a visible element.
 *
 * A missing token means someone opened the link after it was consumed or
 * mangled; the page says so and offers the way back to /forgot-password rather
 * than an empty form that can only fail.
 */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const [state, formAction] = useActionState(resetPasswordAction, INITIAL_ACTION_STATE);

  if (!token) {
    return (
      <div className="flex flex-col gap-c54-4">
        <Alert tone="danger">This reset link is missing its token.</Alert>
        <p className="text-c54-sm text-c54-text-secondary">
          Request a fresh link and open it from your email.
        </p>
        <Link
          href="/forgot-password"
          className="text-c54-sm font-c54-medium text-c54-action-primary hover:underline"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (state.ok) {
    return (
      <div className="flex flex-col gap-c54-4">
        <Alert tone="success">{state.message}</Alert>
        <Link
          href="/login"
          className="text-c54-sm font-c54-medium text-c54-action-primary hover:underline"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-c54-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <input type="hidden" name="token" value={token} />

      <Field
        label="New password"
        htmlFor="new-password"
        error={state.fieldErrors?.newPassword}
        hint={PASSWORD_REQUIREMENT}
        required
      >
        {(field) => (
          <Input
            {...field}
            id={field.id}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            autoFocus
            placeholder="Choose a new password"
            minLength={12}
            invalid={field.invalid}
          />
        )}
      </Field>

      <Field
        label="Confirm new password"
        htmlFor="confirm-password"
        error={state.fieldErrors?.confirmPassword}
        required
      >
        {(field) => (
          <Input
            {...field}
            id={field.id}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat the new password"
            invalid={field.invalid}
          />
        )}
      </Field>

      <SubmitButton pendingLabel="Updating…" fullWidth size="lg">
        Update password
      </SubmitButton>
    </form>
  );
}
