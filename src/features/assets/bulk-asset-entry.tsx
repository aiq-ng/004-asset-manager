"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Check, ClipboardList, Printer, Upload } from "lucide-react";

import {
  createBulkAssetEntryAction,
  submitBulkAssetEntryAction,
} from "@/features/assets/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogCancelButton } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/controls";
import { EntitySelect } from "@/components/ui/entity-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";
import { IMAGE_UPLOAD_MAX_BYTES } from "@/lib/config";
import { BULK_ASSET_ENTRY_MAX } from "@/lib/validators/asset";

const MAX_IMAGE_MB = IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024);

export interface AssetTypeOption {
  id: string;
  name: string;
  code: string;
}

/** What is agreed once, up front, and then applies to every row of the batch. */
interface Batch {
  assetType: string;
  name: string;
  brand: string;
  model: string;
  quantity: number;
}

/**
 * The in-progress batch, kept so an accidental close costs nothing.
 *
 * `saved` is keyed by string rather than number only because it round-trips through
 * JSON, and a numeric index silently becoming `"3"` is the sort of thing that makes
 * a lookup miss and the sheet look broken.
 */
interface Draft {
  batch: Batch;
  serials: string[];
  /** Slot index (as a string) to the asset id it was registered as. */
  saved: Record<string, string>;
}

const DRAFT_KEY = "inv-cat:bulk-asset-entry";

function readDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!parsed.batch || !Array.isArray(parsed.serials)) return null;
    return {
      // Rebuilt field by field rather than passed through, because a draft
      // written by an older build is missing whatever has been added since:
      // `brand` arrived after the first release, `model` after that. Passing the
      // parsed object straight through leaves those undefined, which is a value
      // that submits as the string "undefined" rather than as empty.
      batch: {
        assetType: parsed.batch.assetType,
        name: parsed.batch.name,
        brand: parsed.batch.brand ?? "",
        model: parsed.batch.model ?? "",
        quantity: parsed.batch.quantity,
      },
      serials: parsed.serials,
      saved: parsed.saved ?? {},
    };
  } catch {
    // A corrupt or unreadable draft is not worth surfacing: the worst case is that
    // somebody starts again, which is exactly where they were before.
    return null;
  }
}

function typeName(types: AssetTypeOption[], code: string): string {
  return types.find((type) => type.code === code)?.name ?? code;
}

/**
 * Register many items of one kind in a single sitting.
 *
 * The shape follows the way the work actually happens: a person has a sheet in
 * front of them listing twenty identical monitors, and the tedious part is not
 * deciding anything, it is filling in twenty forms. So the decision is made once —
 * type, description, how many — and after that it is serials.
 *
 * Two ways to get through them, because the two situations are genuinely
 * different. Saving one at a time is durable: the register fills in as they go, a
 * duplicate serial fails on that one field with the rest of the work intact, and
 * stopping halfway loses nothing. Saving the lot at once is fast: one round trip
 * for the whole column instead of one per row. The primary button offers whichever
 * fits — it reads "Save and next" while the column is still being filled, and
 * becomes "Submit" once the last serial is in.
 *
 * The draft is mirrored to local storage on every keystroke, so closing the sheet
 * by accident reopens exactly where it was.
 */
function BulkAssetEntryDialog({
  assetTypes,
  onClose,
}: {
  assetTypes: AssetTypeOption[];
  onClose: () => void;
}) {
  // Two dispatches, both mounted for the life of the sheet. Which one the form
  // posts to is decided by the button, not by swapping components — the footer
  // button targets a form by id, so there is only ever one form to target.
  const [singleState, singleAction, singlePending] = useActionState(
    createBulkAssetEntryAction,
    INITIAL_ACTION_STATE,
  );
  const [batchState, batchAction, batchPending] = useActionState(
    submitBulkAssetEntryAction,
    INITIAL_ACTION_STATE,
  );

  // One object is the whole batch, so it persists and restores as a unit and there
  // is no way for the quantity and the list of slots to disagree.
  //
  // Reading storage in the initializer rather than an effect is deliberate: this
  // sheet is only mounted once someone opens it, so it never renders on the server
  // and there is no markup for a restored draft to disagree with.
  const [draft, setDraft] = useState<Draft | null>(() => readDraft());
  const [setupErrors, setSetupErrors] = useState<Record<string, string>>({});
  const [restored, setRestored] = useState(() => draft !== null);

  const serialRefs = useRef(new Map<number, HTMLInputElement>());

  /**
   * The batch's one photo, shared by every row.
   *
   * Held in a ref rather than in `draft`, and that is a deliberate gap: a `File`
   * cannot be JSON-serialised into local storage, so putting it in the draft
   * would either throw on every keystroke or silently drop it. The consequence
   * is that an accidental close keeps the type, the name and the serials but
   * loses the picture — which the hint under the picker now says out loud,
   * because a photo that silently vanishes halfway through a twenty-item batch
   * is worse than one that was never chosen.
   */
  const batchPhotoRef = useRef<File | null>(null);
  const [batchPhotoName, setBatchPhotoName] = useState<string | null>(null);

  /**
   * The input inside the form that actually submits.
   *
   * The picker sits in the setup step, but setup is a client-side `onSubmit`
   * that never talks to the server — the submissions that create assets are the
   * ones on the serial form. So the file is mirrored into a real input there,
   * which is what actually gets serialised into the `FormData`.
   *
   * Written from the form's own `onSubmit` rather than an effect, because that
   * is the only ordering that is guaranteed: the handler runs before React reads
   * the form, and React empties the form the moment the action returns — an
   * effect would race that reset and lose the file on every save.
   */
  const serialFileRef = useRef<HTMLInputElement>(null);

  function syncBatchPhoto() {
    const input = serialFileRef.current;
    if (!input) return;
    // Cleared first so a batch whose photo was removed does not keep submitting
    // the previous one.
    input.value = "";
    const file = batchPhotoRef.current;
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
  }

  useEffect(() => {
    try {
      if (draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      else window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Private browsing and full quotas both throw here. The sheet still works,
      // it just will not survive an accidental close.
    }
  }, [draft]);

  const batch = draft?.batch ?? null;
  const serials = draft?.serials ?? [];
  const saved = draft?.saved ?? {};

  const total = batch?.quantity ?? 0;
  const savedIndexes = Object.keys(saved).map(Number);
  const isSaved = (index: number) => index in saved;
  const value = (index: number) => serials[index] ?? "";

  const filledIndexes = serials
    .map((_, index) => index)
    .filter((index) => value(index).trim().length > 0 && !isSaved(index));

  const allFilled = total > 0 && filledIndexes.length + savedIndexes.length >= total;
  const unsavedSerials = filledIndexes.map((index) => value(index).trim());

  /**
   * The button reads "Submit" only once the whole column is in and there is still
   * something unregistered left to put in; otherwise it saves the next one.
   */
  const submitMode = allFilled && unsavedSerials.length > 0;
  const currentIndex = filledIndexes[0] ?? -1;
  const currentSerial = currentIndex >= 0 ? value(currentIndex).trim() : "";

  // Folding a finished save back into the draft during render is React's supported
  // way to react to a changed input, and the right one here: the slot clears and
  // the counter moves in the same paint as the save rather than a frame later.
  // `consumed*` makes each save count once, since `useActionState` never resets.
  const [consumedSingle, setConsumedSingle] = useState<string | null>(null);
  const [consumedBatch, setConsumedBatch] = useState<string | null>(null);

  const savedSingle = singleState.ok ? singleState.data : undefined;
  if (savedSingle && savedSingle.id !== consumedSingle && currentIndex >= 0) {
    setConsumedSingle(savedSingle.id);
    setDraft((previous) =>
      previous
        ? {
            ...previous,
            serials: previous.serials.map((entry, index) =>
              index === currentIndex ? "" : entry,
            ),
            saved: { ...previous.saved, [String(currentIndex)]: savedSingle.assetId },
          }
        : previous,
    );
  }

  const batchResult = batchState.ok ? batchState.data : undefined;
  const batchSignature = batchResult
    ? `${batchResult.created.length}/${batchResult.skipped.length}/${batchResult.created[0]?.assetId ?? "-"}`
    : null;
  if (batchResult && batchSignature !== consumedBatch) {
    setConsumedBatch(batchSignature);
    setDraft((previous) => {
      if (!previous) return previous;

      // Pair by serial, not by position: a serial refused in the middle of the
      // column would otherwise slide every later asset id onto the wrong row.
      // Created serials are unique by the time they get here — the service
      // dedupes within the batch — so matching on the value is safe.
      const createdSerials = new Set(batchResult.created.map((row) => row.serial));

      const nextSaved = { ...previous.saved };
      const nextSerials = previous.serials.map((entry, index) => {
        const serial = entry.trim();
        if (!serial || !createdSerials.has(serial) || String(index) in nextSaved) return entry;
        // Only cleared once its asset exists. A refused serial keeps its slot and
        // its text, so it can be read, corrected and submitted again instead of
        // being retyped from the paper it was just copied off.
        nextSaved[String(index)] =
          batchResult.created.find((row) => row.serial === serial)?.assetId ?? "";
        return "";
      });

      return { ...previous, serials: nextSerials, saved: nextSaved };
    });
  }

  const registeredIds = Object.entries(saved)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, assetId]) => assetId);
  const registeredCount = registeredIds.length;
  const complete = total > 0 && registeredCount >= total;
  const hasFieldError = Object.keys(singleState.fieldErrors ?? {}).length > 0;

  function handleStart(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const assetType = String(form.get("assetType") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    const brand = String(form.get("brand") ?? "").trim();
    const model = String(form.get("model") ?? "").trim();
    const rawQuantity = String(form.get("quantity") ?? "").trim();
    const quantity = Number(rawQuantity);

    const errors: Record<string, string> = {};
    if (!assetType) errors.assetType = "Choose an asset type.";
    if (!name) errors.name = "Add a name.";
    if (!brand) errors.brand = "Add a brand.";
    if (!rawQuantity || !Number.isInteger(quantity) || quantity < 1) {
      errors.quantity = "Enter how many items you are entering.";
    } else if (quantity > BULK_ASSET_ENTRY_MAX) {
      errors.quantity = `Enter ${BULK_ASSET_ENTRY_MAX} or fewer per batch.`;
    }

    setSetupErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setConsumedSingle(null);
    setConsumedBatch(null);
    setRestored(false);
    setDraft({
      batch: { assetType, name, brand, model, quantity },
      serials: Array.from({ length: quantity }, () => ""),
      saved: {},
    });
  }

  function setSerial(index: number, next: string) {
    setDraft((previous) =>
      previous
        ? { ...previous, serials: previous.serials.map((entry, i) => (i === index ? next : entry)) }
        : previous,
    );
  }

  function startOver() {
    setConsumedSingle(null);
    setConsumedBatch(null);
    setRestored(false);
    setDraft(null);
  }

  /** Moves to the next slot that needs a serial, so typing simply continues. */
  function focusNext(from: number) {
    for (let index = from + 1; index < total; index += 1) {
      if (isSaved(index) || value(index).trim()) continue;
      serialRefs.current.get(index)?.focus();
      return;
    }
    // Column complete: fall back to the last slot so the submit button is the next
    // thing within reach rather than sending the cursor nowhere.
    serialRefs.current.get(from)?.focus();
  }

  const title = !batch ? "Register in bulk" : complete ? "All registered" : "Register in bulk";

  // Whichever action the current button posts to is the one whose pending state
  // the sheet cares about; the other form is not being submitted and its state is
  // idle. Both footers read this. See `SubmitButton` for why it cannot be
  // `useFormStatus` — the footer is outside the form.
  //
  // The setup step is deliberately absent: it is a client-side `onSubmit` that
  // reads the form and calls `setDraft`, with no round trip to wait for.
  const pending = !batch ? false : submitMode ? batchPending : singlePending;

  return (
    <Dialog
      open
      onClose={onClose}
      side="right"
      title={title}
      description={
        !batch
          ? "Describe the items once, then enter each one's serial number."
          : "Enter the serials one by one, or fill the column and submit it at once."
      }
      // Not while the setup step is running — there is nothing in flight then, and
      // locking the sheet would be locking it against a click that already landed.
      busy={pending}
      footer={
        !batch ? (
          <>
            {restored ? (
              <Button variant="ghost" onClick={startOver}>
                Discard saved draft
              </Button>
            ) : null}
            <DialogCancelButton />
            {/* No `pendingLabel`: the setup step is a client-side `onSubmit` that
                reads the form and calls `setDraft`. There is no round trip to wait
                for, so a spinner here would be a lie about work in progress. */}
            <SubmitButton form="bulk-asset-setup" pending={pending}>
              Start entering
            </SubmitButton>
          </>
        ) : !complete ? (
          <>
            <DialogCancelButton />
            {submitMode ? (
              <SubmitButton form="bulk-asset-form" pendingLabel="Registering…" pending={pending}>
                Submit {unsavedSerials.length} item{unsavedSerials.length === 1 ? "" : "s"}
              </SubmitButton>
            ) : (
              <SubmitButton
                form="bulk-asset-form"
                pendingLabel="Saving…"
                pending={pending}
                disabled={!currentSerial}
              >
                Save and next
              </SubmitButton>
            )}
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      {!batch ? (
        <form id="bulk-asset-setup" onSubmit={handleStart} className="flex flex-col gap-c54-4">
          {restored && draft ? (
            <Alert tone="warning" title="Draft found">
              You have an unfinished batch saved in this browser: {draft.batch.quantity} ×{" "}
              {typeName(assetTypes, draft.batch.assetType)}.
            </Alert>
          ) : null}
          {setupErrors.form ? <Alert tone="danger">{setupErrors.form}</Alert> : null}

          <Field
            label="Asset type"
            htmlFor="bulk-asset-type"
            error={setupErrors.assetType}
            hint="Applies to every item in this batch."
            required
          >
            {(field) => (
              <EntitySelect
                {...field}
                id={field.id}
                name="assetType"
                invalid={field.invalid}
                defaultValue=""
                options={assetTypes.map((type) => ({
                  value: type.code,
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
            htmlFor="bulk-asset-name"
            error={setupErrors.name}
            hint="What a person would recognise this as."
            required
          >
            {(field) => (
              <Input
                {...field}
                id={field.id}
                name="name"
                placeholder="24-inch editing monitor"
              />
            )}
          </Field>

          <Field
            label="Brand"
            htmlFor="bulk-asset-brand"
            error={setupErrors.brand}
            hint="Who made them. Shared by every item in the batch."
            required
          >
            {(field) => (
              <Input
                {...field}
                id={field.id}
                name="brand"
                placeholder="Dell, LG, Samsung…"
              />
            )}
          </Field>

          <Field
            label="Model"
            htmlFor="bulk-asset-model"
            error={setupErrors.model}
            hint="Optional. Shared by every item in the batch."
          >
            {(field) => (
              <Input
                {...field}
                id={field.id}
                name="model"
                placeholder="U2422H, 27UP850…"
              />
            )}
          </Field>

          <Field
            label="How many?"
            htmlFor="bulk-asset-quantity"
            error={setupErrors.quantity}
            hint={`How many separate items you are entering, up to ${BULK_ASSET_ENTRY_MAX}.`}
            required
          >
            {(field) => (
              <Input
                {...field}
                id={field.id}
                name="quantity"
                type="number"
                min={1}
                max={BULK_ASSET_ENTRY_MAX}
                step={1}
                defaultValue={1}
                placeholder="20"
              />
            )}
          </Field>

          <p className="border-t border-c54-border-default pt-c54-3 text-c54-2xs text-c54-text-muted">
            Each item becomes its own asset with its own id and label, so every one of
            them can be tracked and assigned separately.
          </p>

          {/* One picture for the batch, because a batch is one kind of item. A
              per-row picker would mean twenty uploads to describe twenty
              identical monitors. */}
          <div className="flex flex-col gap-c54-1">
            <label
              htmlFor="bulk-asset-photo"
              className="block text-c54-xs font-c54-medium text-c54-text-primary"
            >
              Photo
            </label>
            <label
              htmlFor="bulk-asset-photo"
              className="flex cursor-pointer items-center justify-center gap-c54-2 rounded-c54-input border border-c54-border-default bg-c54-bg-card px-c54-3 py-c54-2 text-c54-sm text-c54-text-secondary transition-colors hover:border-c54-border-strong hover:text-c54-text-primary"
            >
              <Upload className="size-3.5" />
              {batchPhotoName ?? "Choose a photo for the whole batch (optional)"}
              <input
                id="bulk-asset-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  batchPhotoRef.current = file;
                  setBatchPhotoName(file ? file.name : null);
                }}
              />
            </label>
            <p className="text-c54-2xs text-c54-text-muted">
              JPEG, PNG or WebP, up to {MAX_IMAGE_MB} MB. Applied to every item registered
              from this batch. Not saved with the draft, so a batch resumed after closing
              the sheet needs the photo picked again.
            </p>
          </div>
        </form>
      ) : null}

      {batch && !complete ? (
        <>
          <div className="mb-c54-4 rounded-c54-input border border-c54-border-default bg-c54-bg-muted/40 p-c54-3">
            <div className="flex items-baseline justify-between gap-c54-2">
              <p className="text-c54-xs font-c54-medium text-c54-text-secondary">
                {typeName(assetTypes, batch.assetType)}
              </p>
              <p className="text-c54-xs font-c54-semibold text-c54-text-primary">
                {registeredCount} of {total} registered
              </p>
            </div>
            <p className="mt-c54-1 text-c54-sm text-c54-text-primary">
              {/* Just the name, as typed. Brand and model have their own columns
                  and their own fields on the edit sheet; folding them into the
                  summary is what used to make them show up twice. */}
              {batch.name}
            </p>
            {batchPhotoName ? (
              <p className="mt-c54-1 text-c54-2xs text-c54-text-muted">
                Photo applied to every item: {batchPhotoName}
              </p>
            ) : null}
            <div
              className="mt-c54-3 h-1 w-full overflow-hidden rounded-full bg-c54-bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={registeredCount}
              aria-label="Items registered"
            >
              <div
                className="h-full bg-c54-action-primary transition-[width] duration-c54-base"
                style={{ width: `${total === 0 ? 0 : (registeredCount / total) * 100}%` }}
              />
            </div>
          </div>

          {savedSingle ? (
            <Alert tone="success">{savedSingle.assetId} registered.</Alert>
          ) : batchResult && batchResult.created.length > 0 ? (
            <Alert tone="success">
              {batchResult.created.length} registered: {batchResult.created.map((row) => row.assetId).join(", ")}
            </Alert>
          ) : null}

          {batchResult && batchResult.skipped.length > 0 ? (
            <Alert tone="warning" title={`${batchResult.skipped.length} not registered`}>
              <ul className="mt-c54-1 flex flex-col gap-c54-1">
                {batchResult.skipped.map((row) => (
                  <li key={row.serial} className="font-mono text-c54-xs">
                    {row.serial} ({row.reason})
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {!savedSingle && !batchResult?.created.length && singleState.error && !hasFieldError ? (
            <Alert tone="danger">{singleState.error}</Alert>
          ) : null}
          {batchState.error ? <Alert tone="danger">{batchState.error}</Alert> : null}

          {/* One form, two destinations. In single mode it carries exactly the one
              serial being saved; in submit mode it carries the whole column. The
              visible inputs stay unnamed and are driven by `draft`, so the same
              markup serves both without the FormData ever disagreeing with what is
              on screen. */}
          <form
            id="bulk-asset-form"
            action={submitMode ? batchAction : singleAction}
            onSubmit={syncBatchPhoto}
            className="flex flex-col gap-c54-3"
          >
            {/* Carries the batch photo. `syncBatchPhoto` fills it from the stash on
                every submit, because React empties the form the moment the action
                returns. Left empty when no photo was chosen, which the action
                reads as "no image" rather than an empty upload. */}
            <input
              ref={serialFileRef}
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />
            <input type="hidden" name="assetType" value={batch.assetType} />
            <input type="hidden" name="name" value={batch.name} />
            <input type="hidden" name="brand" value={batch.brand} />
            <input type="hidden" name="model" value={batch.model} />
            {submitMode ? (
              unsavedSerials.map((serial, index) => (
                <input key={index} type="hidden" name="serials" value={serial} />
              ))
            ) : (
              <input type="hidden" name="serialNumber" value={currentSerial} />
            )}

            <ol className="flex flex-col gap-c54-2">
              {serials.map((_, index) =>
                isSaved(index) ? (
                  <li
                    key={index}
                    className="flex items-center gap-c54-3 rounded-c54-input border border-c54-border-default bg-c54-bg-muted/40 px-c54-3 py-c54-2"
                  >
                    <span className="w-c54-6 shrink-0 text-c54-2xs tabular-nums text-c54-text-muted">
                      {index + 1}
                    </span>
                    <Check className="size-4 shrink-0 text-c54-text-success" />
                    <Link
                      href={`/assets/${saved[String(index)]}`}
                      className="font-mono text-c54-xs hover:underline"
                    >
                      {saved[String(index)]}
                    </Link>
                  </li>
                ) : (
                  <li key={index} className="flex items-center gap-c54-3">
                    <span className="w-c54-6 shrink-0 text-c54-2xs tabular-nums text-c54-text-muted">
                      {index + 1}
                    </span>
                    <Input
                      ref={(node) => {
                        if (node) serialRefs.current.set(index, node);
                        else serialRefs.current.delete(index);
                      }}
                      value={value(index)}
                      onChange={(event) => setSerial(index, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        focusNext(index);
                      }}
                      placeholder="Serial number"
                      aria-label={`Serial number for item ${index + 1}`}
                      autoComplete="off"
                      spellCheck={false}
                      invalid={Boolean(singleState.fieldErrors?.serialNumber)}
                    />
                  </li>
                ),
              )}
            </ol>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-c54-2 border-t border-c54-border-default pt-c54-3">
            <p className="text-c54-2xs text-c54-text-muted">
              {allFilled
                ? `All ${total} serials are in. Submit them together, or save one at a time.`
                : `${unsavedSerials.length} of ${total} filled in. Progress is saved in this browser.`}
            </p>
            <Button variant="ghost" size="sm" onClick={startOver}>
              Start over
            </Button>
          </div>
        </>
      ) : null}

      {batch && complete ? (
        <div className="flex flex-col gap-c54-4">
          <Alert tone="success" title="All registered">
            {total} {typeName(assetTypes, batch.assetType).toLowerCase()}
            {total === 1 ? "" : "s"} added to the register.
          </Alert>

          {batchResult && batchResult.skipped.length > 0 ? (
            <Alert tone="warning" title={`${batchResult.skipped.length} not registered`}>
              <ul className="mt-c54-1 flex flex-col gap-c54-1">
                {batchResult.skipped.map((row) => (
                  <li key={row.serial} className="font-mono text-c54-xs">
                    {row.serial} ({row.reason})
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}

          <div>
            <p className="text-c54-xs font-c54-medium text-c54-text-secondary">
              Asset ids created
            </p>
            <ul className="mt-c54-2 flex flex-wrap gap-c54-1">
              {registeredIds.map((assetId) => (
                <li key={assetId}>
                  <Link
                    href={`/assets/${assetId}`}
                    className="rounded-c54-input border border-c54-border-default px-c54-2 py-c54-1 font-mono text-c54-xs hover:border-c54-border-strong hover:underline"
                  >
                    {assetId}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <Link
            href={`/assets/labels?ids=${registeredIds.join(",")}`}
            className="inline-flex h-9 items-center justify-center gap-c54-2 rounded-c54-button bg-c54-action-primary px-c54-4 text-c54-sm font-c54-medium text-c54-text-inverted hover:bg-c54-action-primary-hover"
          >
            <Printer className="size-4" />
            Print their labels
          </Link>

          <p className="text-c54-2xs text-c54-text-muted">
            This draft has been cleared from your browser.
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}

/**
 * The trigger, which owns the sheet's open state.
 *
 * Mounted only while open so a dismissed sheet leaves no action state behind.
 * Reopening picks the saved draft back up rather than asking for the type again.
 */
export function BulkAssetEntryButton({ assetTypes }: { assetTypes: AssetTypeOption[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ClipboardList className="size-3.5" />
        Register in bulk
      </Button>
      {open ? (
        <BulkAssetEntryDialog assetTypes={assetTypes} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}