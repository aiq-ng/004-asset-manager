"use client";

import { useActionState, useCallback, useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { createStaffAction, updateStaffAction } from "@/features/staff/actions";
import { clearCreateSheetParam } from "@/features/shared/create-sheet-param";
import { Button } from "@/components/ui/button";
import { Dialog, DialogCancelButton } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/controls";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { DepartmentSelect, type DepartmentOption } from "@/features/departments/department-select";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";
import { ASSIGNABLE_ROLES, rolePresentation } from "@/features/staff/role-presentation";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

/**
 * Create a staff account, in a right-hand sheet.
 *
 * The password is required here, and deliberately so. The service can create a
 * locked account with no password at all — that is what the API and the invite
 * flow are for — but a `<form>` always submits its field, and an empty string is
 * a string: `passwordSchema.optional()` skips `undefined`, not `""`, so leaving
 * the box blank was always refused while the hint under it invited exactly that.
 * Requiring it in the browser is what makes the two agree.
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
  const [state, formAction, pending] = useActionState(createStaffAction, INITIAL_ACTION_STATE);

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title="Add a staff member"
      description="Create an account for somebody who can hold an asset."
      busy={pending}
      footer={
        <>
          <DialogCancelButton />
          <SubmitButton form="staff-create-form" pendingLabel="Creating…" pending={pending}>
            <Plus className="size-3.5" />
            Create account
          </SubmitButton>
        </>
      }
    >
      <form id="staff-create-form" action={formAction} className="flex flex-col gap-c54-4">
        {/* Every text field is seeded from the last submission: React empties an
            uncontrolled form once its action returns, so a rejected account would
            otherwise arrive having thrown away the name and the address along
            with whichever field was wrong. Passwords are deliberately absent —
            `submittedValues` never echoes them. */}
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <Field label="Name" htmlFor="staff-name" error={state.fieldErrors?.name} required>
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="name"
              placeholder="Ana Ribeiro"
              autoComplete="off"
              defaultValue={state.values?.name ?? ""}
            />
          )}
        </Field>

        <DepartmentSelect
          // Re-keyed on what came back, because a `<select>` only reads its
          // `defaultValue` at mount. The combobox branch keeps its own state and
          // needs nothing; the native one is put back by the remount.
          key={state.values?.departmentId ?? "unsubmitted"}
          departments={departments}
          id="staff-department"
          name="departmentId"
          defaultValue={state.values?.departmentId ?? ""}
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
              defaultValue={state.values?.email ?? ""}
            />
          )}
        </Field>

        <Field label="Phone" htmlFor="staff-phone" error={state.fieldErrors?.phone}>
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="phone"
              type="tel"
              placeholder="Optional"
              defaultValue={state.values?.phone ?? ""}
            />
          )}
        </Field>

        <Field
          label="Role"
          htmlFor="staff-role"
          error={state.fieldErrors?.role}
          hint={rolePresentation("USER").summary}
          required
        >
          {(field) => (
            <Select
              {...field}
              id={field.id}
              name="role"
              key={state.values?.role ?? "unsubmitted"}
              defaultValue={state.values?.role ?? "USER"}
            >
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
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. Hand it over out of band; they can change it from Settings once they are in.`}
          required
        >
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
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
export function StaffCreateButton({
  departments,
  openInitially = false,
}: {
  departments: DepartmentOption[];
  /** Open the sheet on arrival, for `/staff?new`. See `create-sheet-param`. */
  openInitially?: boolean;
}) {
  const [open, setOpen] = useState(openInitially);
  const close = useCallback(() => {
    setOpen(false);
    clearCreateSheetParam();
  }, []);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
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
  const [state, formAction, pending] = useActionState(updateStaffAction, INITIAL_ACTION_STATE);
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
      busy={pending}
      footer={
        <>
          <DialogCancelButton />
          <SubmitButton
            form="staff-edit-form"
            pendingLabel="Saving…"
            pending={pending}
            disabled={locked}
          >
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
            <Input
              {...field}
              id={field.id}
              name="name"
              defaultValue={state.values?.name ?? staff.name}
              disabled={locked}
            />
          )}
        </Field>

        <DepartmentSelect
          // Keyed on what came back so a native `<select>` picks the department up
          // again; without it the reset puts the selection back to the mark React
          // made at mount and the edit silently reverts this field.
          key={state.values?.departmentId ?? "unsubmitted"}
          departments={departments}
          id="edit-staff-department"
          name="departmentId"
          defaultValue={state.values?.departmentId ?? staff.departmentId}
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
              defaultValue={state.values?.email ?? staff.email}
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
                defaultValue={state.values?.phone ?? staff.phone ?? ""}
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
                // Keyed like the department picker: a `<select>` reads its
                // `defaultValue` once, at mount.
                key={state.values?.role ?? "unsubmitted"}
                defaultValue={state.values?.role ?? staff.role}
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
        <Pencil className="size-3.5" />
        Edit
      </Button>
      {open ? (
        <StaffEditDialog staff={staff} departments={departments} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}