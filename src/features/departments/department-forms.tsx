"use client";

import { useActionState, useCallback, useState } from "react";

import {
  createDepartmentAction,
  deleteDepartmentAction,
  updateDepartmentAction,
} from "@/features/departments/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogCancelButton } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/controls";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { Icons } from "@/components/ui/icons";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";

/**
 * Create a department, in a right-hand sheet.
 *
 * Named, not invented: this action has no return redirect because there is no
 * single record to land on — a new department shows up as a row on the page the
 * operator is already looking at. The sheet closes on success and unmounts, so
 * reopening starts from a clean field.
 */
function DepartmentCreateDialog({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(
    createDepartmentAction,
    INITIAL_ACTION_STATE,
  );

  return (
    <Dialog
      open={!state.ok}
      onClose={onClose}
      side="right"
      title="Add a department"
      description="Departments are shared: everybody on staff picks from the same list."
      busy={pending}
      footer={
        <>
          <DialogCancelButton />
          {/* `pending` is passed because this button is in the footer, outside the
              form below, where `useFormStatus` cannot see it. See `SubmitButton`. */}
          <SubmitButton form="department-create-form" pendingLabel="Adding…" pending={pending}>
            <Icons.Plus className="size-3.5" />
            Add department
          </SubmitButton>
        </>
      }
    >
      <form id="department-create-form" action={formAction} className="flex flex-col gap-c54-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <Field label="Name" htmlFor="department-name" error={state.fieldErrors?.name} required>
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="name"
              placeholder="Operations"
              autoComplete="off"
              // Seeded from the last submission: React empties the form once the
              // action returns, so a duplicate name would arrive having thrown
              // away the name that was actually being typed.
              defaultValue={state.values?.name ?? ""}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}

export function DepartmentCreateButton() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Icons.Plus className="size-3.5" />
        Add department
      </Button>
      {open ? <DepartmentCreateDialog onClose={close} /> : null}
    </>
  );
}

/**
 * Rename a department.
 *
 * Only the label changes. Accounts keep pointing at the same row, so renaming is
 * safe at any time — worth stating in the dialog, because renaming a department
 * that somebody has "moved on from" is a reasonable worry otherwise.
 */
function DepartmentRenameDialog({
  department,
  onClose,
}: {
  department: { id: string; name: string };
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    updateDepartmentAction,
    INITIAL_ACTION_STATE,
  );

  return (
    <Dialog
      open={!state.ok}
      onClose={onClose}
      side="right"
      title={`Rename ${department.name}`}
      description="Accounts stay in this department; only the label changes."
      busy={pending}
      footer={
        <>
          <DialogCancelButton />
          <SubmitButton form="department-rename-form" pendingLabel="Saving…" pending={pending}>
            Save name
          </SubmitButton>
        </>
      }
    >
      <form id="department-rename-form" action={formAction} className="flex flex-col gap-c54-4">
        <input type="hidden" name="id" value={department.id} />

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <Field label="Name" htmlFor={`department-name-${department.id}`} error={state.fieldErrors?.name} required>
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="name"
              defaultValue={state.values?.name ?? department.name}
              autoComplete="off"
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}

export function DepartmentRenameButton({ department }: { department: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Icons.Edit className="size-3.5" />
        Rename
      </Button>
      {open ? (
        <DepartmentRenameDialog department={department} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

/**
 * Delete a department.
 *
 * Kept only when nobody is in it: the foreign key is `ON DELETE RESTRICT`, so the
 * button is disabled with the reason spelled out rather than letting the
 * operator submit something that is guaranteed to fail.
 */
export function DepartmentDeleteControl({
  department,
}: {
  department: { id: string; name: string; staffCount: number };
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(deleteDepartmentAction, INITIAL_ACTION_STATE);
  const blocked = department.staffCount > 0;

  return (
    <>
      <Button
        variant="danger"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={blocked}
        title={blocked ? `${department.name} still has staff in it` : undefined}
      >
        <Icons.Trash className="size-3.5" />
        Delete
      </Button>

      <ConfirmDialog
        open={open && !state.ok}
        onClose={() => setOpen(false)}
        title={`Delete ${department.name}?`}
        description="This cannot be undone. Nobody will be able to pick it from a department list again."
        confirmLabel="Delete department"
        variant="danger"
        action={action}
        fields={{ id: department.id }}
      >
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      </ConfirmDialog>
    </>
  );
}