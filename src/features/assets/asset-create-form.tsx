"use client";

import { useActionState, useState } from "react";

import { createAssetAction } from "@/features/assets/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogCancelButton } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/controls";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { Icons } from "@/components/ui/icons";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";
import { IMAGE_UPLOAD_MAX_BYTES } from "@/lib/config";

const MAX_IMAGE_MB = IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024);

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
  const [photoName, setPhotoName] = useState<string | null>(null);

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

        {/* Same shape as the detail page's photo manager: the file input is the
            whole control rather than a staged crop flow. The photo rides along
            with the create submission, so a fresh asset lands on its detail page
            already pictured instead of needing a second trip to attach one. */}
        <div className="flex flex-col gap-c54-1">
          <label
            htmlFor="asset-photo"
            className="block text-c54-xs font-c54-medium text-c54-text-primary"
          >
            Photo
          </label>
          <label
            htmlFor="asset-photo"
            className="flex cursor-pointer items-center justify-center gap-c54-2 rounded-c54-input border border-c54-border-default bg-c54-bg-card px-c54-3 py-c54-2 text-c54-sm text-c54-text-secondary transition-colors hover:border-c54-border-strong hover:text-c54-text-primary"
          >
            <Icons.Upload className="size-3.5" />
            {photoName ?? "Choose an image (optional)"}
            <input
              id="asset-photo"
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => setPhotoName(event.target.files?.[0]?.name ?? null)}
            />
          </label>
          <p className="text-c54-2xs text-c54-text-muted">
            JPEG, PNG or WebP, up to {MAX_IMAGE_MB} MB. Identifies the item on the shelf; you can
            also add or replace it later from the asset page.
          </p>
          {state.fieldErrors?.file ? (
            <p className="text-c54-2xs text-c54-text-danger">{state.fieldErrors.file}</p>
          ) : null}
        </div>

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