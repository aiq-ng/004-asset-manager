"use client";

import { useActionState, useState } from "react";

import { createAssetAction } from "@/features/assets/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogCancelButton } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/controls";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { Icons } from "@/components/ui/icons";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";

export interface AssetTypeOption {
  id: string;
  name: string;
  code: string;
}

/**
 * Register a new asset, in a right-hand sheet.
 *
 * This used to be a page of its own at `/assets/new`. As a sheet it keeps the
 * register visible behind it, which is the point: the person registering usually
 * arrived from a list they are still reading.
 *
 * `createAssetAction` redirects to the new record on success, so the sheet does
 * not close itself — the navigation replaces the page and the sheet goes with it.
 * That also means a reload cannot resubmit, which is why the redirect was worth
 * keeping rather than swapping for a close-and-stay.
 */
function AssetCreateDialog({
  assetTypes,
  onClose,
}: {
  assetTypes: AssetTypeOption[];
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(createAssetAction, INITIAL_ACTION_STATE);
  const [unit, setUnit] = useState("1");

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title="Register asset"
      description="Add an item to the register. The asset id is allocated on save."
      footer={
        <>
          <DialogCancelButton />
          <SubmitButton form="asset-create-form" pendingLabel="Registering…">
            Register asset
          </SubmitButton>
        </>
      }
    >
      <form id="asset-create-form" action={formAction} className="flex flex-col gap-c54-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <Field
          label="Asset type"
          htmlFor="asset-type"
          error={state.fieldErrors?.assetType}
          hint="Sets the prefix of the generated asset id."
          required
        >
          {(field) => (
            <Select {...field} id={field.id} name="assetType" invalid={field.invalid} defaultValue="">
              <option value="">Choose a type…</option>
              {assetTypes.map((type) => (
                <option key={type.id} value={type.code}>
                  {type.name} ({type.code})
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Name"
          htmlFor="asset-name"
          error={state.fieldErrors?.name}
          hint="What a person would recognise this as."
          required
        >
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="name"
              placeholder="14-inch developer laptop"
            />
          )}
        </Field>

        <Field
          label="Brand"
          htmlFor="asset-brand"
          error={state.fieldErrors?.brand}
          hint={'Optional. Composes the name as "Name (Brand)".'}
        >
          {(field) => (
            <Input {...field} id={field.id} name="brand" placeholder="HP, Dell, Lenovo…" />
          )}
        </Field>

        <Field
          label="Serial number"
          htmlFor="asset-serial"
          error={state.fieldErrors?.serialNumber}
          hint="Optional. Stored as NULL if left blank."
        >
          {(field) => <Input {...field} id={field.id} name="serialNumber" placeholder="C02X1234ABCD" />}
        </Field>

        <Field label="Units" htmlFor="asset-unit" error={state.fieldErrors?.unit} required>
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="unit"
              type="number"
              min={1}
              step={1}
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
            />
          )}
        </Field>

        <p className="border-t border-c54-border-default pt-c54-3 text-c54-2xs text-c54-text-muted">
          The asset id is allocated on save and cannot be changed afterwards.
        </p>
      </form>
    </Dialog>
  );
}

/**
 * The trigger, which owns the sheet's open state.
 *
 * `assetTypes` is resolved by the page and handed in as plain data, so the sheet
 * never queries anything itself and the list is already in flight while the
 * button is being clicked.
 */
export function AssetCreateButton({ assetTypes }: { assetTypes: AssetTypeOption[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Icons.Plus className="size-3.5" />
        Register asset
      </Button>
      {open ? <AssetCreateDialog assetTypes={assetTypes} onClose={() => setOpen(false)} /> : null}
    </>
  );
}