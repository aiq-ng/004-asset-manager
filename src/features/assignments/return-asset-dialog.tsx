"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "react-hot-toast";
import { Upload } from "lucide-react";

import { returnAssetAction } from "@/features/assets/actions";
import { Dialog, DialogCancelButton, DialogCloseOnSuccess } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/controls";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { useRetainedFile } from "@/features/shared/use-retained-file";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";
import { IMAGE_UPLOAD_MAX_BYTES } from "@/lib/config";

const MAX_IMAGE_MB = IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024);

/**
 * The return sheet: condition description, optional photo, confirm.
 *
 * Shared by every return control — the asset detail panel and the return button
 * in the assignments table — so that recording a return captures the same
 * evidence wherever it is started. It is not a bare confirmation: what the asset
 * came back like is worth capturing while the two people are still standing
 * together, not reconstructed later from memory.
 *
 * A right-hand sheet rather than a centred modal, like every other form sheet in
 * the app. It starts from a row in the register, and keeping the register
 * visible to the left means the row being acted on never leaves the screen —
 * which is the whole point of confirming something irreversible.
 *
 * `returnAssetAction` does not redirect, so this component stays mounted after
 * it resolves and a resolved `useActionState` would still be sitting there on
 * the next open — making a second attempt silently do nothing. The sheet is
 * therefore closed through `DialogCloseOnSuccess`, which lets the panel play its
 * exit and then hands the unmount to the parent's `onClose`, so that state is
 * reset.
 *
 * The toast and the close both key off `state.ok`, and they run in that order in
 * the same commit: the sheet animates out while the confirmation is already on
 * screen, so there is no gap where the operator sees neither.
 *
 * Mounted only while open by the caller. That makes each return a fresh form,
 * so the previous return's action state can never leak into the next one — and
 * it lets the sheet outlive the refresh a successful return triggers, which
 * swaps the asset detail panel to its "not assigned" branch underneath.
 */
export function ReturnAssetDialog({
  assignmentId,
  assetId,
  holderName,
  onClose,
}: {
  assignmentId: string;
  assetId: string;
  holderName: string;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(returnAssetAction, INITIAL_ACTION_STATE);
  // The photo is a `File`, so it cannot come back through `state.values` the way
  // the condition notes do. It is stashed here instead and re-attached after a
  // rejected submit, so a retry still carries the picture.
  const photo = useRetainedFile({ submission: state, ok: state.ok });

  // The confirmation has to outlive this component. The sheet unmounts as soon
  // as the exit animation finishes, and a toast fired as local state would be
  // torn down with it — but `react-hot-toast` keeps its queue in a store above
  // the route, so the notification survives the unmount.
  //
  // The ref guards the one-shot: the close is deferred through an animation, so
  // this effect can be reconciled more than once before the unmount lands, and a
  // second "Return recorded" on top of the first would be a lie about a single
  // recorded return.
  const toasted = useRef(false);
  useEffect(() => {
    if (!state.ok || toasted.current) return;
    toasted.current = true;
    // A node rather than a string: the library has one `message` slot and no
    // `description` field, so the second line is markup. The sizes are the toast
    // type scale rather than the button's, since this is not a button.
    toast.success(
      <span className="flex flex-col gap-c54-1 text-left">
        <span className="text-c54-sm font-c54-medium text-c54-text-primary">
          {assetId} returned by {holderName}
        </span>
        <span className="text-c54-xs text-c54-text-secondary">
          The assignment is closed and the asset is available again.
        </span>
      </span>,
    );
  }, [state.ok, assetId, holderName]);

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title="Record this return?"
      description={`${assetId} returns from ${holderName} and is available again. This closes the assignment for good.`}
      // A return closes the assignment row for good. Letting the panel be
      // dismissed mid-submit would leave the operator with a request still
      // running and no way to see what it did.
      busy={pending}
      footer={
        <>
          <DialogCancelButton />
          {/* `pending` is passed rather than left to `useFormStatus`: this button
              is in the footer, not inside the form below, so the hook cannot see
              it. See `SubmitButton`. */}
          <SubmitButton form="return-asset-form" pendingLabel="Recording…" pending={pending}>
            Record return
          </SubmitButton>
        </>
      }
    >
      <DialogCloseOnSuccess when={state.ok} />

      <form id="return-asset-form" action={formAction} className="flex flex-col gap-c54-4">
        {/* Seeded from the last submission: React empties the form once the action
            returns, so a rejected return would otherwise arrive having thrown away
            the condition notes written while the two people were still together. */}
        <input type="hidden" name="assignmentId" value={assignmentId} />

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <Field
          label="Description"
          htmlFor="return-note"
          error={state.fieldErrors?.returnNote}
          hint="Condition at handover. Note any damage or missing accessories."
        >
          {(field) => (
            <Textarea
              {...field}
              id={field.id}
              name="returnNote"
              placeholder="Scratched lid; charger included…"
              defaultValue={state.values?.returnNote ?? ""}
            />
          )}
        </Field>

        {/* Same shape as the asset photo controls: the file input is the whole
            upload UI, and the action sniffs the magic bytes server-side. */}
        <div className="flex flex-col gap-c54-1">
          <label
            htmlFor="return-photo"
            className="block text-c54-xs font-c54-medium text-c54-text-primary"
          >
            Photo
          </label>
          <label
            htmlFor="return-photo"
            className="flex cursor-pointer items-center justify-center gap-c54-2 rounded-c54-input border border-c54-border-default bg-c54-bg-card px-c54-3 py-c54-2 text-c54-sm text-c54-text-secondary transition-colors hover:border-c54-border-strong hover:text-c54-text-primary"
          >
            <Upload className="size-3.5" />
            {photo.name ?? "Choose an image (optional)"}
            <input
              {...photo.inputProps}
              id="return-photo"
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
            />
          </label>
          <p className="text-c54-2xs text-c54-text-muted">
            JPEG, PNG or WebP, up to {MAX_IMAGE_MB} MB. Kept with the assignment as a record of how
            the asset came back.
          </p>
          {state.fieldErrors?.file ? (
            <p className="text-c54-2xs text-c54-text-danger">{state.fieldErrors.file}</p>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
