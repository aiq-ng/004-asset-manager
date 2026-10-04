"use client";

import { useActionState } from "react";

import { bootstrapSuperadminAction } from "@/features/auth/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/controls";
import { Alert } from "@/components/ui/feedback";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

/**
 * The one-time form that creates the SUPERADMIN on a fresh install.
 *
 * A plain form with the action on `<form>`, so it works before hydration: on an
 * install with no accounts there is no session, no data to load and nothing to
 * lose if JavaScript has not arrived yet. A form that only submits on a click
 * handler would be the one screen in the app where a slow device gets a dead
 * button.
 *
 * The confirmation field is validated on the server rather than compared in the
 * browser, so the check cannot be skipped by anything that posts to the action
 * directly.
 */
export function BootstrapForm() {
  const [state, formAction, pending] = useActionState(
    bootstrapSuperadminAction,
    INITIAL_ACTION_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-c54-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label="Your name" htmlFor="bootstrap-name" error={state.fieldErrors?.name} required>
        {(field) => (
          <Input
            {...field}
            id={field.id}
            name="name"
            autoComplete="name"
            autoFocus
            placeholder="Ana Ribeiro"
            invalid={field.invalid}
            // React empties the form once the action returns, so a rejected setup
            // would otherwise arrive having thrown away the name and the address
            // along with the password that was refused.
            defaultValue={state.values?.name ?? ""}
          />
        )}
      </Field>

      <Field
        label="Email"
        htmlFor="bootstrap-email"
        error={state.fieldErrors?.email}
        hint="This is the sign-in address for the superadmin."
        required
      >
        {(field) => (
          <Input
            {...field}
            id={field.id}
            name="email"
            type="email"
            autoComplete="username"
            placeholder="you@company.com"
            invalid={field.invalid}
            defaultValue={state.values?.email ?? ""}
          />
        )}
      </Field>

      <Field
        label="Password"
        htmlFor="bootstrap-password"
        error={state.fieldErrors?.password}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        required
      >
        {(field) => (
          <Input
            {...field}
            id={field.id}
            name="password"
            type="password"
            autoComplete="new-password"
            invalid={field.invalid}
          />
        )}
      </Field>

      {/* `autoComplete="new-password"` rather than `current-password`: there is no
          current password to confirm on a fresh install, and browsers that see
          `current-password` may try to autofill an unrelated saved login into
          this box. */}
      <Field
        label="Confirm password"
        htmlFor="bootstrap-confirm"
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
            invalid={field.invalid}
          />
        )}
      </Field>

      <SubmitButton pendingLabel="Setting up…" pending={pending} fullWidth size="lg">
        Create superadmin
      </SubmitButton>
    </form>
  );
}
