"use client";

import Link from "next/link";
import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/controls";
import { Alert } from "@/components/ui/feedback";
import { loginAction } from "@/features/auth/actions";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";

/**
 * Sign-in form.
 *
 * `useActionState` gives pending state and field errors from the Server Action
 * with no local state at all, and the form still works before hydration because
 * the action is attached to the `<form>` rather than to an onClick handler.
 */
export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(loginAction, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-c54-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <input type="hidden" name="next" value={next} />

      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email} required>
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

      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password} required>
        {(field) => (
          <Input
            {...field}
            id={field.id}
            name="password"
            type="password"
            placeholder="Enter password"
            autoComplete="current-password"
            invalid={field.invalid}
          />
        )}
      </Field>

      <SubmitButton pendingLabel="Signing in…" fullWidth size="lg">
        Sign in
      </SubmitButton>

      <div className="text-center">
        <Link href="/forgot-password" className="text-c54-sm text-c54-text-secondary hover:underline">
          Forgot password?
        </Link>
      </div>
    </form>
  );
}