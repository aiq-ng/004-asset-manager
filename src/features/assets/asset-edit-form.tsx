"use client";

import { useActionState } from "react";

import { updateAssetAction } from "@/features/assets/actions";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/controls";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";

/**
 * Edit the mutable fields of an asset.
 *
 * `ASSIGNED` is deliberately absent from the status list: the service refuses a
 * status change while an asset is checked out, so offering it would only produce
 * a 422. An assigned asset has to come back through the assignments page first.
 */
export function AssetEditForm({
  asset,
  canChangeStatus,
}: {
  asset: {
    assetId: string;
    description: string;
    brand: string | null;
    unit: number;
    serialNumber: string | null;
    status: string;
  };
  canChangeStatus: boolean;
}) {
  const [state, formAction] = useActionState(updateAssetAction, INITIAL_ACTION_STATE);

  const statusValue = state.data?.status ?? asset.status;

  return (
    <form action={formAction} className="flex flex-col gap-c54-5">
      <input type="hidden" name="assetId" value={asset.assetId} />

      {state.ok ? (
        <Alert tone="success">{state.message || "Saved."}</Alert>
      ) : state.error ? (
        <Alert tone="danger">{state.error}</Alert>
      ) : null}

      <Field
        label="Name"
        htmlFor="edit-name"
        error={state.fieldErrors?.name}
        required
      >
        {(field) => (
          <Input {...field} id={field.id} name="name" defaultValue={asset.description.replace(/\s*\([^)]*\)$/, "")} />
        )}
      </Field>

      <Field
        label="Brand"
        htmlFor="edit-brand"
        error={state.fieldErrors?.brand}
        hint={'Optional. Composes the name as "Name (Brand)".'}
      >
        {(field) => (
          <Input
            {...field}
            id={field.id}
            name="brand"
            defaultValue={asset.brand ?? ""}
            placeholder="HP, Dell, Lenovo…"
          />
        )}
      </Field>

      <div className="grid gap-c54-5 sm:grid-cols-2">
        <Field
          label="Serial number"
          htmlFor="edit-serial"
          error={state.fieldErrors?.serialNumber}
          hint="Blank is stored as NULL."
        >
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="serialNumber"
              defaultValue={asset.serialNumber ?? ""}
            />
          )}
        </Field>

        <Field label="Units" htmlFor="edit-unit" error={state.fieldErrors?.unit} required>
          {(field) => (
            <Input {...field} id={field.id} name="unit" type="number" min={1} step={1} defaultValue={asset.unit} />
          )}
        </Field>
      </div>

      <Field
        label="Status"
        htmlFor="edit-status"
        error={state.fieldErrors?.status}
        hint={
          statusValue === "ASSIGNED"
            ? "Assigned assets return to available through their assignment, not here."
            : canChangeStatus
              ? undefined
              : "You can change status, but only if you can also manage assets."
        }
      >
        {(field) => (
          <Select
            {...field}
            id={field.id}
            name="status"
            defaultValue={asset.status}
            disabled={!canChangeStatus || statusValue === "ASSIGNED"}
          >
            <option value="AVAILABLE">Available</option>
            <option value="UNDER_REPAIR">Under repair</option>
            <option value="RETIRED">Retired</option>
          </Select>
        )}
      </Field>

      <div className="border-t border-c54-border-default pt-c54-4">
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}