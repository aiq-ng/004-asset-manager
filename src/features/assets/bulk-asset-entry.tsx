"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  createBulkAssetEntryAction,
  submitBulkAssetEntryAction,
} from "@/features/assets/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogCancelButton } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/controls";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { Icons } from "@/components/ui/icons";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";
import { BULK_ASSET_ENTRY_MAX } from "@/lib/validators/asset";

export interface AssetTypeOption {
  id: string;
  name: string;
  code: string;
}

/** What is agreed once, up front, and then applies to every row of the batch. */
interface Batch {
  assetType: string;
  description: string;
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
      batch: parsed.batch,
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
  const [singleState, singleAction] = useActionState(
    createBulkAssetEntryAction,
    INITIAL_ACTION_STATE,
  );
  const [batchState, batchAction] = useActionState(
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
    const description = String(form.get("description") ?? "").trim();
    const rawQuantity = String(form.get("quantity") ?? "").trim();
    const quantity = Number(rawQuantity);

    const errors: Record<string, string> = {};
    if (!assetType) errors.assetType = "Choose an asset type.";
    if (!description) errors.description = "Add a description.";
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
      batch: { assetType, description, quantity },
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
      footer={
        !batch ? (
          <>
            {restored ? (
              <Button variant="ghost" onClick={startOver}>
                Discard saved draft
              </Button>
            ) : null}
            <DialogCancelButton />
            <SubmitButton form="bulk-asset-setup" pendingLabel="Starting…">
              Start entering
            </SubmitButton>
          </>
        ) : !complete ? (
          <>
            <DialogCancelButton />
            {submitMode ? (
              <SubmitButton form="bulk-asset-form" pendingLabel="Registering…">
                Submit {unsavedSerials.length} item{unsavedSerials.length === 1 ? "" : "s"}
              </SubmitButton>
            ) : (
              <SubmitButton
                form="bulk-asset-form"
                pendingLabel="Saving…"
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
            label="Description"
            htmlFor="bulk-asset-description"
            error={setupErrors.description}
            hint="What a person would recognise this as."
            required
          >
            {(field) => (
              <Textarea
                {...field}
                id={field.id}
                name="description"
                placeholder="24-inch editing monitor"
                rows={2}
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
            <p className="mt-c54-1 text-c54-sm text-c54-text-primary">{batch.description}</p>
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
                    {row.serial} — {row.reason}
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
            className="flex flex-col gap-c54-3"
          >
            <input type="hidden" name="assetType" value={batch.assetType} />
            <input type="hidden" name="description" value={batch.description} />
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
                    <Icons.Check className="size-4 shrink-0 text-c54-text-success" />
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
                      placeholder="Serial number, or leave blank to skip"
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
                ? `All ${total} serials are in — submit them together, or save one at a time.`
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
                    {row.serial} — {row.reason}
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
            <Icons.Printer className="size-4" />
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
        <Icons.Clipboard className="size-3.5" />
        Register in bulk
      </Button>
      {open ? (
        <BulkAssetEntryDialog assetTypes={assetTypes} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}