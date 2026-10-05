"use client";

import { useActionState } from "react";

import { updateAssetAction } from "@/features/assets/actions";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/controls";
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
    model: string | null;
    serialNumber: string | null;
    status: string;
  };
  canChangeStatus: boolean;
}) {
  const [state, formAction] = useActionState(updateAssetAction, INITIAL_ACTION_STATE);

  const statusValue = state.data?.status ?? asset.status;

  // React empties an uncontrolled form once its action returns, whether or not
  // it succeeded, so every field here falls back to the record as it was. After a
  // rejected save the values from `state` win; otherwise the record is what the
  // form opens with.
  const currentName = state.values?.name ?? asset.description.replace(/\s*\([^)]*\)$/, "");

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
          <Input {...field} id={field.id} name="name" defaultValue={currentName} />
        )}
      </Field>

      {/* Brand and model sit together because they are read together: one says
          who made it, the other says which one. Two free-text fields side by
          side is also the only way they ever get filled in consistently. */}
      <div className="grid gap-c54-5 sm:grid-cols-2">
        <Field label="Brand" htmlFor="edit-brand" error={state.fieldErrors?.brand}>
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="brand"
              defaultValue={state.values?.brand ?? asset.brand ?? ""}
              placeholder="HP, Dell, Lenovo…"
            />
          )}
        </Field>

        <Field label="Model" htmlFor="edit-model" error={state.fieldErrors?.model}>
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="model"
              defaultValue={state.values?.model ?? asset.model ?? ""}
              placeholder="Latitude 5440, ProBook 450…"
            />
          )}
        </Field>
      </div>

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
            defaultValue={state.values?.serialNumber ?? asset.serialNumber ?? ""}
          />
        )}
      </Field>

      <Field
        label="Status"
        htmlFor="edit-status"
        error={state.fieldErrors?.status}
        // Re-keyed on what came back, so the status `<select>` inside is
        // remounted: it only reads its `defaultValue` when it mounts, and the
        // reset after a rejected save would otherwise put the status back to the
        // record's.
        //
        // The key sits on `Field` rather than on the `Select` itself. A `<select>`
        // with static `<option>` children is a shape React can validate at compile
        // time; giving that element a dynamic key makes the compiler treat the
        // children as an unkeyed list instead, and every render logs "Each child
        // in a list should have a unique key prop". Keying the wrapper remounts
        // exactly the same subtree and keeps that warning away.
        key={state.values?.status ?? "unsubmitted"}
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
            defaultValue={state.values?.status ?? asset.status}
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