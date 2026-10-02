"use client";

import { useActionState, useMemo, useState } from "react";

import { assignAssetAction } from "@/features/assets/actions";
import { Dialog, DialogCancelButton, DialogCloseOnSuccess } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/controls";
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
  const [search, setSearch] = useState("");

  const candidates = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matching = needle
      ? staff.filter(
          (person) =>
            person.name.toLowerCase().includes(needle) ||
            person.email.toLowerCase().includes(needle) ||
            person.department.toLowerCase().includes(needle),
        )
      : staff;

    return matching.slice(0, 100);
  }, [staff, search]);

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

        <Field label="Filter list" htmlFor="assign-filter">
          {(field) => (
            <Input
              {...field}
              id={field.id}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email or department"
            />
          )}
        </Field>

        <Field
          label="Staff member"
          htmlFor="assign-staff"
          error={state.fieldErrors?.staffId}
          hint={
            candidates.length === 0
              ? "Nobody matches that filter. Only staff you are allowed to assign to are listed."
              : `${candidates.length} available`
          }
          required
        >
          {(field) => (
            <Select {...field} id={field.id} name="staffId" invalid={field.invalid} defaultValue="">
              <option value="">Choose someone…</option>
              {candidates.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} — {person.department}
                </option>
              ))}
            </Select>
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