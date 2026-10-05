"use client";

import { useActionState, useCallback, useState } from "react";
import { Plus, Upload } from "lucide-react";

import { createAssetAction } from "@/features/assets/actions";
import { clearCreateSheetParam } from "@/features/shared/create-sheet-param";
import { Button } from "@/components/ui/button";
import { Dialog, DialogCancelButton } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/controls";
import { EntitySelect } from "@/components/ui/entity-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { useRetainedFile } from "@/features/shared/use-retained-file";
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
  const [state, formAction, pending] = useActionState(createAssetAction, INITIAL_ACTION_STATE);
  // The photo is a `File`, so it cannot come back through `state.values` the way
  // the text fields do. It is stashed here instead and re-attached after a
  // rejected submit, so a retry still carries the picture.
  const photo = useRetainedFile({ submission: state, ok: state.ok });

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title="Register asset"
      description="Add an item to the register. The asset id is allocated on save."
      busy={pending}
      footer={
        <>
          <DialogCancelButton />
          {/* `pending` is passed because this button is in the footer, outside the
              form below, where `useFormStatus` cannot see it. See `SubmitButton`. */}
          <SubmitButton form="asset-create-form" pendingLabel="Registering…" pending={pending}>
            Register asset
          </SubmitButton>
        </>
      }
    >
      <form id="asset-create-form" action={formAction} className="flex flex-col gap-c54-4">
        {/* Every field below is seeded from the last submission. React empties an
            uncontrolled form once its action returns, so without this a rejected
            registration would arrive having thrown away the description, the type
            and the photo picker along with the two fields that were wrong. */}
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <Field
          label="Asset type"
          htmlFor="asset-type"
          error={state.fieldErrors?.assetType}
          hint="Sets the prefix of the generated asset id."
          required
        >
          {(field) => (
            <EntitySelect
              // Keyed on what came back, because a `<select>` only reads its
              // `defaultValue` when it mounts: React marks the chosen option
              // `defaultSelected` once, and the reset after a failed action puts
              // the selection back to that mark. Re-keying is what puts the
              // person's type back where they left it.
              key={state.values?.assetType ?? "unsubmitted"}
              {...field}
              id={field.id}
              name="assetType"
              invalid={field.invalid}
              defaultValue={state.values?.assetType ?? ""}
              options={assetTypes.map((type) => ({
                value: type.code,
                // The code is searchable as well as shown: it is what appears on
                // the asset id, so it is what somebody arrives holding.
                label: `${type.name} (${type.code})`,
                searchKeys: [type.code],
              }))}
              placeholder="Choose a type…"
              searchPlaceholder="Search types or codes…"
            />
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
              defaultValue={state.values?.name ?? ""}
              placeholder="14-inch developer laptop"
            />
          )}
        </Field>

        <Field
          label="Brand"
          htmlFor="asset-brand"
          error={state.fieldErrors?.brand}
          hint="Who made it. Searchable and filterable on its own."
          required
        >
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="brand"
              defaultValue={state.values?.brand ?? ""}
              placeholder="HP, Dell, Lenovo…"
            />
          )}
        </Field>

        <Field
          label="Model"
          htmlFor="asset-model"
          error={state.fieldErrors?.model}
          hint="Optional. Searchable and filterable on its own."
        >
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="model"
              defaultValue={state.values?.model ?? ""}
              placeholder="Latitude 5440, ProBook 450…"
            />
          )}
        </Field>

        <Field
          label="Serial number"
          htmlFor="asset-serial"
          error={state.fieldErrors?.serialNumber}
          hint="Printed on the item. It is how the asset is found again."
          required
        >
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="serialNumber"
              defaultValue={state.values?.serialNumber ?? ""}
              placeholder="C02X1234ABCD"
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
            <Upload className="size-3.5" />
            {photo.name ?? "Choose an image (optional)"}
            <input
              {...photo.inputProps}
              id="asset-photo"
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
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
export function AssetCreateButton({
  assetTypes,
  openInitially = false,
}: {
  assetTypes: AssetTypeOption[];
  /** Open the sheet on arrival, for `/assets?new`. See `create-sheet-param`. */
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
        Register asset
      </Button>
      {open ? <AssetCreateDialog assetTypes={assetTypes} onClose={close} /> : null}
    </>
  );
}