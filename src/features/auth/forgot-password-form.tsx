"use client";

import Link from "next/link";
import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/controls";
import { Alert } from "@/components/ui/feedback";
import { forgotPasswordAction } from "@/features/auth/actions";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";

/**
 * Request a password-reset email.
 *
 * Success is deliberately identical whether or not the address is registered —
 * the page never confirms that an account exists. The link goes out from the
 * service; all this form can promise is "check your inbox".
 */
export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, INITIAL_ACTION_STATE);

  if (state.ok) {
    return (
      <div className="flex flex-col gap-c54-4">
        <Alert tone="success">{state.message}</Alert>
        <Link
          href="/login"
          className="text-c54-sm font-c54-medium text-c54-action-primary hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-c54-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field
        label="Email"
        htmlFor="email"
        error={state.fieldErrors?.email}
        hint="We'll send a link to set a new password."
        required
      >
        {(field) => (
          <Input
            {...field}
            id={field.id}
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            placeholder="you@company.com"
            invalid={field.invalid}
          />
        )}
      </Field>

      <SubmitButton pendingLabel="Sending…" fullWidth size="lg">
        Send reset link
      </SubmitButton>

      <Link href="/login" className="text-c54-sm text-c54-text-secondary hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
