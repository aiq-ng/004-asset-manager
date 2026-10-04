"use client";

import { useActionState, useCallback, useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { createAssetTypeAction, updateAssetTypeAction } from "@/features/asset-types/actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/controls";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { Dialog, DialogCancelButton, DialogCloseOnSuccess } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatAssetId } from "@/lib/services/asset-id";
import { cn } from "@/lib/utils/cn";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";

export interface AssetTypeRow {
  id: string;
  name: string;
  code: string;
  assetCount: number;
}

/** Stands in for the code until somebody types one. */
const CODE_PLACEHOLDER = "XXX";

/**
 * Live preview of the asset id this type will mint.
 *
 * It reads the value actually typed into the code field, because the obvious
 * alternative — a fixed `IT-LAP-0001` written into the markup — is a claim about
 * the data that is only true for one particular code. Somebody entering `MON`
 * would be shown an example of somebody else's id, which is worse than showing
 * none: the whole reason the preview is there is that the prefix is permanent, so
 * it has to be the prefix that was actually chosen.
 *
 * `formatAssetId` is the single source of truth for the shape, so this cannot
 * drift from what the register will actually issue.
 */
function AssetIdPreview({ code }: { code: string }) {
  const typed = code.trim().toUpperCase();
  // `2` is the schema minimum: below that the value is not yet a legal code, so
  // showing it as if it were one would be a promise the server will not keep.
  const settled = typed.length >= 2;

  return (
    <div className="rounded-c54-card border border-c54-border-default bg-c54-bg-muted/40 px-c54-3 py-c54-3">
      <p className="text-c54-2xs font-c54-medium uppercase tracking-wide text-c54-text-muted">
        First asset id
      </p>
      <code
        className={cn(
          "mt-c54-1 block font-c54-mono text-c54-sm",
          settled ? "text-c54-text-primary" : "text-c54-text-muted",
        )}
      >
        {formatAssetId(settled ? typed : CODE_PLACEHOLDER, 1)}
      </code>
      {!settled ? (
        <p className="mt-c54-1 text-c54-2xs text-c54-text-muted">
          Updates as you type the code.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Create an asset type, in a right-hand sheet.
 *
 * Unlike the staff and asset forms, `createAssetTypeAction` does not redirect —
 * a type is not a record with a page of its own. So the sheet closes itself on
 * success via `DialogCloseOnSuccess`, and `revalidatePath` inside the action is
 * what puts the new row into the table behind the sheet. Unmounting via the
 * dialog's own close is also what clears the resolved action state, so the next
 * open starts clean.
 */
function AssetTypeCreateDialog({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(
    createAssetTypeAction,
    INITIAL_ACTION_STATE,
  );
  // The preview reads what came back after a rejected submission, so it keeps
  // showing the code being entered instead of dropping back to the placeholder.
  // The fallback to local state is what makes typing still drive it.
  const [typedCode, setTypedCode] = useState("");
  const code = state.values?.code ?? typedCode;

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title="Add an asset type"
      description="A category that supplies the asset id prefix."
      busy={pending}
      footer={
        <>
          <DialogCancelButton />
          <SubmitButton form="asset-type-create-form" pendingLabel="Creating…" pending={pending}>
            <Plus className="size-3.5" />
            Add type
          </SubmitButton>
        </>
      }
    >
      <DialogCloseOnSuccess when={state.ok} />
      <form id="asset-type-create-form" action={formAction} className="flex flex-col gap-c54-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <Field
          label="Name"
          htmlFor="type-name"
          error={state.fieldErrors?.name}
          hint="Shown wherever a type is picked, so write it the way people would say it."
          required
        >
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="name"
              placeholder="Laptop"
              defaultValue={state.values?.name ?? ""}
            />
          )}
        </Field>

        <Field
          label="Code"
          htmlFor="type-code"
          error={state.fieldErrors?.code}
          hint="2–4 letters. This becomes the id prefix, so it cannot be changed once assets exist."
          required
        >
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="code"
              placeholder="LAP"
              maxLength={4}
              className="font-c54-mono uppercase"
              defaultValue={state.values?.code ?? ""}
              onChange={(event) => setTypedCode(event.target.value)}
            />
          )}
        </Field>

        <AssetIdPreview code={code} />
      </form>
    </Dialog>
  );
}

/**
 * The trigger, which owns the sheet's open state.
 *
 * Mounted on open only, so dismissing and reopening starts from a clean action
 * state instead of leaving the previous submission's errors on screen.
 */
export function AssetTypeCreateButton() {
  const [open, setOpen] = useState(false);
  // Stable, so the close-on-success effect inside the sheet only reacts to the
  // state actually changing rather than to a fresh arrow on every render.
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Add type
      </Button>
      {open ? <AssetTypeCreateDialog onClose={close} /> : null}
    </>
  );
}

/**
 * Rename an asset type.
 *
 * The code field is disabled once the type has assets: changing it would leave
 * every already-issued `IT-LAP-0001` pointing at a type that says something else,
 * which the service also refuses.
 */
export function AssetTypeEditDialog({
  assetType,
  onClose,
}: {
  assetType: AssetTypeRow;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    updateAssetTypeAction,
    INITIAL_ACTION_STATE,
  );
  const codeLocked = assetType.assetCount > 0;

  return (
    <Dialog
      open={!state.ok}
      onClose={onClose}
      title="Edit asset type"
      description={`${assetType.assetCount} ${assetType.assetCount === 1 ? "asset uses" : "assets use"} this type.`}
      busy={pending}
      footer={
        <>
          <DialogCancelButton />
          <SubmitButton form="asset-type-edit-form" pendingLabel="Saving…" pending={pending}>
            Save
          </SubmitButton>
        </>
      }
    >
      <form id="asset-type-edit-form" action={formAction} className="flex flex-col gap-c54-4">
        <input type="hidden" name="id" value={assetType.id} />

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <Field label="Name" htmlFor="edit-type-name" error={state.fieldErrors?.name} required>
          {(field) => (<Input
              {...field}
              id={field.id}
              name="name"
              defaultValue={state.values?.name ?? assetType.name}
            />
          )}
        </Field>

        <Field
          label="Code"
          htmlFor="edit-type-code"
          error={state.fieldErrors?.code}
          hint={
            codeLocked
              ? "Locked: changing the code would orphan every existing asset id."
              : "2–4 letters"
          }
        >
          {(field) => (
            <Input
              {...field}
              id={field.id}
              name="code"
              defaultValue={state.values?.code ?? assetType.code}
              disabled={codeLocked}
              maxLength={4}
              className="font-c54-mono uppercase"
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}

/** The edit trigger, which owns the open/closed state. */
export function AssetTypeRowActions({ assetType }: { assetType: AssetTypeRow }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" />
        Edit
      </Button>
      {open ? <AssetTypeEditDialog assetType={assetType} onClose={() => setOpen(false)} /> : null}
    </>
  );
}