"use client";

import { useActionState } from "react";

import { changePasswordAction, changePasswordModalAction } from "@/features/settings/actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/controls";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { DialogCloseOnSuccess } from "@/components/ui/dialog";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

/**
 * The change-password form, shared by the settings page and the sidebar modal.
 *
 * Submits the no-redirect action variant: a success closes the dialog (via
 * `DialogCloseOnSuccess`) rather than navigating to `/settings`.
 */
export function ChangePasswordForm({
  email,
  hasPassword,
  action = changePasswordModalAction,
}: {
  email: string;
  /** An account created without a password may skip the current-password check. */
  hasPassword: boolean;
  /**
   * Which action the form submits. The settings page passes the redirecting
   * variant; the modal uses the default, which closes itself on success.
   */
  action?: typeof changePasswordAction;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-c54-4">
      <DialogCloseOnSuccess when={state.ok} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field
        label="Current password"
        htmlFor="current-password"
        error={state.fieldErrors?.currentPassword}
        hint={
          hasPassword
            ? "Required. Signing in elsewhere stays signed out."
            : "This account has no password yet, so leave this blank."
        }
      >
        {(field) => (
          <Input
            {...field}
            id={field.id}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
          />
        )}
      </Field>

      <Field
        label="New password"
        htmlFor="new-password"
        error={state.fieldErrors?.newPassword}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        required
      >
        {(field) => (
          <Input
            {...field}
            id={field.id}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        )}
      </Field>

      <Field
        label="Confirm new password"
        htmlFor="confirm-password"
        error={state.fieldErrors?.confirmPassword}
        hint="Must match the new password."
        required
      >
        {(field) => (
          <Input
            {...field}
            id={field.id}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        )}
      </Field>

      <Alert tone="info">
        Changing your password signs out every other device. You stay signed in here.
      </Alert>

      <div className="flex items-center gap-c54-3 border-t border-c54-border-default pt-c54-4">
        <SubmitButton pendingLabel="Updating…">Update password</SubmitButton>
        <span className="truncate text-c54-2xs text-c54-text-muted">{email}</span>
      </div>
    </form>
  );
}
