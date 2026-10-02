"use client";

import { useActionState, useCallback, useState } from "react";

import { createStaffAction, updateStaffAction } from "@/features/staff/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogCancelButton } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/controls";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { Icons } from "@/components/ui/icons";
import { DepartmentSelect, type DepartmentOption } from "@/features/departments/department-select";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";
import { ASSIGNABLE_ROLES, rolePresentation } from "@/features/staff/role-presentation";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

/**
 * Create a staff account, in a right-hand sheet.
 *
 * The password field is optional on purpose: an account created without one is
 * locked and cannot sign in, which is the right default when somebody joins
 * before they have collected their credentials.
 *
 * `createStaffAction` redirects to the new record on success, so this does not
 * have to close itself — the navigation takes the sheet with it. The redirect is
 * kept rather than swapped for a close-and-stay because landing on the record
 * shows the generated id and is where the next action (roles, assets) already is.
 */
function StaffCreateDialog({
  departments,
  onClose,
}: {
  departments: DepartmentOption[];
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(createStaffAction, INITIAL_ACTION_STATE);

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title="Add a staff member"
      description="Create an account for somebody who can hold an asset."
      footer={
        <>
          <DialogCancelButton />
          <SubmitButton form="staff-create-form" pendingLabel="Creating…">
            <Icons.Plus className="size-3.5" />
            Create account
          </SubmitButton>
        </>
      }
    >
      <form id="staff-create-form" action={formAction} className="flex flex-col gap-c54-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <Field label="Name" htmlFor="staff-name" error={state.fieldErrors?.name} required>
          {(field) => (
            <Input {...field} id={field.id} name="name" placeholder="Ana Ribeiro" autoComplete="off" />
          )}
        </Field>

        <DepartmentSelect
          departments={departments}
          id="staff-department"
          name="departmentId"
          error={state.fieldErrors?.departmentId ?? state.fieldErrors?.department}
        />

        <Field label="Email" htmlFor="staff-email" error={state.fieldErrors?.email} required>
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="email"
              type="email"
              placeholder="ana.ribeiro@example.com"
              autoComplete="off"
            />
          )}
        </Field>

        <Field label="Phone" htmlFor="staff-phone" error={state.fieldErrors?.phone}>
          {(field) => <Input {...field} id={field.id} name="phone" type="tel" placeholder="Optional" />}
        </Field>

        <Field
          label="Role"
          htmlFor="staff-role"
          error={state.fieldErrors?.role}
          hint={rolePresentation("USER").summary}
          required
        >
          {(field) => (
            <Select {...field} id={field.id} name="role" defaultValue="USER">
              {ASSIGNABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {rolePresentation(role).label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Initial password"
          htmlFor="staff-password"
          error={state.fieldErrors?.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. Leave blank to create a locked account.`}
        >
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}

/**
 * The trigger, which owns the sheet's open state.
 *
 * The dialog is only mounted once open rather than being handed `open={false}`,
 * so a closed sheet leaves no `<dialog>` in the top layer and no state to reset
 * when it is dismissed — reopening always starts from the initial action state.
 */
export function StaffCreateButton({ departments }: { departments: DepartmentOption[] }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Icons.Plus className="size-3.5" />
        Add staff member
      </Button>
      {open ? (
        <StaffCreateDialog departments={departments} onClose={close} />
      ) : null}
    </>
  );
}

/**
 * Edit a staff account.
 *
 * A password entered here replaces the current one and revokes that account's
 * existing sessions, so the field is not pre-filled — it stays blank unless a new
 * password is actually typed.
 */
export function StaffEditDialog({
  staff,
  departments,
  onClose,
}: {
  staff: {
    id: string;
    name: string;
    department: string;
    departmentId: string;
    email: string;
    phone: string | null;
    role: string;
  };
  departments: DepartmentOption[];
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(updateStaffAction, INITIAL_ACTION_STATE);
  const locked = staff.role === "SUPERADMIN";

  return (
    <Dialog
      open={!state.ok}
      onClose={onClose}
      title={`Edit ${staff.name}`}
      description={
        locked
          ? "The superadmin account cannot be modified from here."
          : "Leave the password blank to keep the current one."
      }
      footer={
        <>
          <DialogCancelButton />
          <SubmitButton form="staff-edit-form" pendingLabel="Saving…" disabled={locked}>
            Save
          </SubmitButton>
        </>
      }
    >
      <form id="staff-edit-form" action={formAction} className="flex flex-col gap-c54-4">
        <input type="hidden" name="id" value={staff.id} />

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {locked ? (
          <Alert tone="warning">
            This account is the superadmin and is protected. Use the CLI if it must change.
          </Alert>
        ) : null}

        <Field label="Name" htmlFor="edit-staff-name" error={state.fieldErrors?.name} required>
          {(field) => (
            <Input {...field} id={field.id} name="name" defaultValue={staff.name} disabled={locked} />
          )}
        </Field>

        <DepartmentSelect
          departments={departments}
          id="edit-staff-department"
          name="departmentId"
          defaultValue={staff.departmentId}
          error={state.fieldErrors?.departmentId ?? state.fieldErrors?.department}
          disabled={locked}
        />

        <Field label="Email" htmlFor="edit-staff-email" error={state.fieldErrors?.email} required>
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="email"
              type="email"
              defaultValue={staff.email}
              disabled={locked}
            />
          )}
        </Field>

        <div className="grid gap-c54-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="edit-staff-phone" error={state.fieldErrors?.phone}>
            {(field) => (
              <Input
                {...field}
                id={field.id}
                name="phone"
                type="tel"
                defaultValue={staff.phone ?? ""}
                disabled={locked}
              />
            )}
          </Field>

          <Field
            label="Role"
            htmlFor="edit-staff-role"
            error={state.fieldErrors?.role}
            hint={rolePresentation(staff.role).summary}
          >
            {(field) => (
              <Select
                {...field}
                id={field.id}
                name="role"
                defaultValue={staff.role}
                disabled={locked || !ASSIGNABLE_ROLES.includes(staff.role as never)}
              >
                {ASSIGNABLE_ROLES.includes(staff.role as never) ? (
                  ASSIGNABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {rolePresentation(role).label}
                    </option>
                  ))
                ) : (
                  <option value={staff.role}>{rolePresentation(staff.role).label}</option>
                )}
              </Select>
            )}
          </Field>
        </div>

        <Field
          label="New password"
          htmlFor="edit-staff-password"
          error={state.fieldErrors?.password}
          hint="Setting this revokes the account's existing sessions."
        >
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              disabled={locked}
              placeholder="Unchanged"
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}

/** Trigger that owns the dialog's open state. */
export function StaffEditButton({
  staff,
  departments,
}: {
  staff: {
    id: string;
    name: string;
    department: string;
    departmentId: string;
    email: string;
    phone: string | null;
    role: string;
  };
  departments: DepartmentOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Icons.Edit className="size-3.5" />
        Edit
      </Button>
      {open ? (
        <StaffEditDialog staff={staff} departments={departments} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}