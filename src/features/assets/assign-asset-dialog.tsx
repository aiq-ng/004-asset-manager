"use client";

import { useActionState, useMemo, useState } from "react";

import { assignAssetAction } from "@/features/assets/actions";
import { Dialog, DialogCancelButton, DialogCloseOnSuccess } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/controls";
import { Combobox } from "@/components/ui/combobox";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";
import type { StaffListOption } from "@/features/staff/types";

/**
 * Assign an asset to a member of staff.
 *
 * The candidate list arrives pre-filtered from the server, which has already
 * applied the rules in `requireAssignableTarget` — an ASSIGNER never sees an admin
 * or the superadmin here. The service re-checks on write, so the rule never
 * depends on the client being honest.
 *
 * A right-hand sheet rather than a centred modal: this is a short, single-purpose
 * form that starts from a row in the register, and keeping the table visible to
 * the left means the row being acted on never leaves the screen.
 *
 * `assignAssetAction` does not redirect, so this component stays mounted after
 * it resolves and a resolved `useActionState` would still be sitting there on
 * the next open — making a second attempt on the same row silently do nothing.
 * The sheet is therefore closed through `DialogCloseOnSuccess`, which lets the
 * panel play its exit and then hands the unmount to the parent's `onClose`, so
 * that state is reset.
 */
export function AssignAssetDialog({
  open,
  onClose,
  assetId,
  staff,
}: {
  open: boolean;
  onClose: () => void;
  assetId: string;
  staff: StaffListOption[];
}) {
  const [state, formAction, pending] = useActionState(assignAssetAction, INITIAL_ACTION_STATE);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      side="right"
      title="Assign asset"
      description={`Hand ${assetId} to a member of staff.`}
      // Assigning flips the asset's status, so the sheet should not be dismissable
      // over a request that is still running.
      busy={pending}
      footer={
        <>
          <DialogCancelButton />
          {/* `pending` is passed because this button is in the footer, outside the
              form below, where `useFormStatus` cannot see it. See `SubmitButton`. */}
          <SubmitButton form="assign-asset-form" pendingLabel="Assigning…" pending={pending}>
            Assign
          </SubmitButton>
        </>
      }
    >
      <DialogCloseOnSuccess when={state.ok} />
      <form id="assign-asset-form" action={formAction} className="flex flex-col gap-c54-4">
        {/* Seeded from the last submission: React empties the form once the action
            returns, so a rejected assignment would otherwise arrive having thrown
            away the person chosen and the note describing the handover. */}
        <input type="hidden" name="assetId" value={assetId} />

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <Field
          label="Staff member"
          htmlFor="assign-staff"
          error={state.fieldErrors?.staffId}
          hint="Only staff you are allowed to assign to are listed."
          required
        >
          {(field) => (
            <Combobox
              {...field}
              id={field.id}
              name="staffId"
              invalid={field.invalid}
              // Re-keyed on the echoed choice, because the combobox takes its
              // `defaultValue` once at mount: the reset after a failed action
              // would otherwise put the box back to the placeholder and leave the
              // person who had been chosen needing to be picked a second time.
              key={state.values?.staffId ?? "unsubmitted"}
              defaultValue={state.values?.staffId ?? ""}
              placeholder="Choose someone…"
              searchPlaceholder="Name, email or department"
              emptyMessage="Nobody matches that filter."
              options={staff.map((person) => ({
                value: person.id,
                label: `${person.name} (${person.department})`,
                // The hint above promises email search, so it searches email.
                // Before this it matched the label only, which is name and
                // department — the one field it said it would find was the one
                // it could not.
                searchKeys: [person.email],
              }))}
            />
          )}
        </Field>

        <Field
          label="Note"
          htmlFor="assign-note"
          error={state.fieldErrors?.note}
          hint="Optional. Recorded against the assignment and in the audit trail."
        >
          {(field) => (
            <Textarea
              {...field}
              id={field.id}
              name="note"
              placeholder="Condition at handover…"
              defaultValue={state.values?.note ?? ""}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}