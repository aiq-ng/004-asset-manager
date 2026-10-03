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
  const [state, formAction] = useActionState(assignAssetAction, INITIAL_ACTION_STATE);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      side="right"
      title="Assign asset"
      description={`Hand ${assetId} to a member of staff.`}
      footer={
        <>
          <DialogCancelButton />
          <SubmitButton form="assign-asset-form" pendingLabel="Assigning…">
            Assign
          </SubmitButton>
        </>
      }
    >
      <DialogCloseOnSuccess when={state.ok} />
      <form id="assign-asset-form" action={formAction} className="flex flex-col gap-c54-4">
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
              placeholder="Choose someone…"
              searchPlaceholder="Name, email or department"
              emptyMessage="Nobody matches that filter."
              options={staff.map((person) => ({
                value: person.id,
                label: `${person.name} — ${person.department}`,
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
            <Textarea {...field} id={field.id} name="note" placeholder="Condition at handover…" />
          )}
        </Field>
      </form>
    </Dialog>
  );
}