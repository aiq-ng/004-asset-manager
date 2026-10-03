"use client";

import { useActionState, useState } from "react";
import { VerticalTimeline, VerticalTimelineElement } from "react-vertical-timeline-component";
import "react-vertical-timeline-component/style.min.css";

import { returnAssetAction } from "@/features/assets/actions";
import { AssignAssetDialog } from "@/features/assets/assign-asset-dialog";
import { Dialog, DialogCancelButton, DialogCloseOnSuccess } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/controls";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, DetailRow } from "@/components/ui/table";
import { Icons } from "@/components/ui/icons";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";
import { IMAGE_UPLOAD_MAX_BYTES } from "@/lib/config";
import type { StaffListOption } from "@/features/staff/types";

const MAX_IMAGE_MB = IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024);

/**
 * The current holder of an asset, with the return and assign controls.
 *
 * `useActionState` lives here rather than in the page because both mutations
 * need a confirmation step: a return is irreversible (the assignment row is
 * closed and cannot be reopened) and an assignment flips the asset's status.
 * The candidate list arrives pre-filtered from the server page, which applies
 * the same rules the service enforces on write.
 */
export function AssignmentPanel({
  assignment,
  canReturn,
  canAssign,
  assetId,
  assetStatus,
  staff,
}: {
  assignment: {
    id: string;
    dateAssigned: string;
    note: string | null;
    staff: { id: string; name: string; department: string; email: string };
    assignedBy: { id: string; name: string; department: string } | null;
  } | null;
  canReturn: boolean;
  /** Shown on an unassigned asset so the detail page can complete a hand-over. */
  canAssign?: boolean;
  assetId?: string;
  assetStatus?: string;
  /** Assignable candidates, narrowed by the server page; absent hides the control. */
  staff?: StaffListOption[];
}) {
  const [returnTarget, setReturnTarget] = useState<{
    assignmentId: string;
    holderName: string;
  } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  // Hoisted above the branch split: a successful return refreshes the page,
  // which swaps this panel to its "not assigned" branch while the sheet is
  // still animating out — the sheet has to survive that swap for the exit to
  // play. Mounting only while open also means each return is a fresh form, so
  // the previous return's action state can never leak into the next one.
  const returnDialog = returnTarget ? (
    <ReturnAssetDialog
      assignmentId={returnTarget.assignmentId}
      holderName={returnTarget.holderName}
      onClose={() => setReturnTarget(null)}
    />
  ) : null;

  if (!assignment) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Assignment</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-c54-3">
          <p className="text-c54-sm text-c54-text-secondary">
            This asset is not currently assigned to anybody.
          </p>

          {canAssign && assetId && assetStatus === "AVAILABLE" && staff ? (
            <div>
              <Button size="sm" onClick={() => setAssignOpen(true)}>
                <Icons.Plus className="size-3.5" />
                Assign to staff
              </Button>
              <AssignAssetDialog
                open={assignOpen}
                onClose={() => setAssignOpen(false)}
                assetId={assetId}
                staff={staff}
              />
            </div>
          ) : null}

          {returnDialog}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assignment</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-c54-4">
        <DescriptionList>
          <DetailRow term="Holder">
            <span className="font-c54-medium">{assignment.staff.name}</span>
            <span className="block text-c54-2xs text-c54-text-muted">{assignment.staff.department}</span>
          </DetailRow>
          <DetailRow term="Assigned by">
            {assignment.assignedBy ? (
              assignment.assignedBy.name
            ) : (
              <span className="text-c54-text-muted">—</span>
            )}
          </DetailRow>
          <DetailRow term="Assigned">{formatDay(assignment.dateAssigned)}</DetailRow>
          {assignment.note ? (
            <DetailRow term="Note" className="sm:col-span-2">
              {assignment.note}
            </DetailRow>
          ) : null}
        </DescriptionList>

        {canReturn ? (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setReturnTarget({ assignmentId: assignment.id, holderName: assignment.staff.name })
              }
            >
              <Icons.Refresh className="size-3.5" />
              Record return
            </Button>
          </div>
        ) : null}
      </CardContent>

      {returnDialog}
    </Card>
  );
}

/**
 * The return sheet: condition description, optional photo, confirm.
 *
 * Replaces the old bare confirmation: what the asset came back like is worth
 * capturing while the two people are still standing together, not reconstructed
 * later from memory. On success `DialogCloseOnSuccess` plays the exit and hands
 * the unmount to the parent's `onClose` — the same pattern the assign sheet
 * uses, which also resets this component's action state for the next return.
 */
function ReturnAssetDialog({
  assignmentId,
  holderName,
  onClose,
}: {
  assignmentId: string;
  holderName: string;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(returnAssetAction, INITIAL_ACTION_STATE);
  const [photoName, setPhotoName] = useState<string | null>(null);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Record this return?"
      description={`${holderName} hands the asset back and it becomes available again. The assignment is closed permanently — reopen it by assigning a new one.`}
      size="sm"
      footer={
        <>
          <DialogCancelButton />
          <SubmitButton form="return-asset-form" pendingLabel="Recording…">
            Record return
          </SubmitButton>
        </>
      }
    >
      <DialogCloseOnSuccess when={state.ok} />

      <form id="return-asset-form" action={formAction} className="flex flex-col gap-c54-4">
        <input type="hidden" name="assignmentId" value={assignmentId} />

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <Field
          label="Description"
          htmlFor="return-note"
          error={state.fieldErrors?.returnNote}
          hint="Condition at handover — damage, missing accessories, anything the next holder should know."
        >
          {(field) => (
            <Textarea
              {...field}
              id={field.id}
              name="returnNote"
              placeholder="Scratched lid; charger included…"
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
            <Icons.Upload className="size-3.5" />
            {photoName ?? "Choose an image (optional)"}
            <input
              id="return-photo"
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => setPhotoName(event.target.files?.[0]?.name ?? null)}
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

/**
 * Full history of assignments, newest first, as a vertical timeline.
 *
 * The library draws the rail and the icon bubbles; its default card (white
 * background, shadow, arrow, padding) is stripped so the entry text sits on
 * the surrounding `Card` and uses the c54 tokens.
 */
export function AssignmentHistory({
  history,
}: {
  history: {
    id: string;
    dateAssigned: string;
    dateReturned: string | null;
    note: string | null;
    staff: { name: string; department: string };
    assignedBy: { name: string } | null;
    /** Condition description captured at return; null while still out or legacy. */
    returnNote: string | null;
    /** Presigned URL of the return photo, resolved by the page; null if none. */
    returnImageUrl: string | null;
    /** Who accepted the return; null while still out or legacy. */
    returnedBy: { name: string } | null;
  }[];
}) {
  if (history.length === 0) {
    return (
      <p className="text-c54-sm text-c54-text-secondary">No assignments recorded yet.</p>
    );
  }

  return (
    <div
      className={
        "[&_.vertical-timeline]:mt-0 [&_.vertical-timeline]:w-full " +
        "[&_.vertical-timeline]:max-w-none [&_.vertical-timeline]:py-0 " +
        "[&_.vertical-timeline-element]:my-c54-5"
      }
    >
      <VerticalTimeline
        layout="1-column-left"
        animate={false}
        lineColor="var(--color-c54-border-default)"
      >
        {history.map((entry) => {
          const active = entry.dateReturned === null;

          return (
            <VerticalTimelineElement
              key={entry.id}
              contentStyle={{ background: "transparent", boxShadow: "none", padding: 0 }}
              contentArrowStyle={{ display: "none" }}
              iconClassName={
                active
                  ? "bg-c54-status-healthy text-white"
                  : "bg-c54-bg-card text-c54-text-muted border border-c54-border-strong"
              }
              iconStyle={{ boxShadow: "0 0 0 4px var(--color-c54-bg-card)" }}
              icon={active ? <Icons.Plus /> : <Icons.Refresh />}
            >
              <p className="flex flex-wrap items-baseline gap-x-c54-2 text-c54-sm font-c54-medium text-c54-text-primary">
                {entry.staff.name}
                <span className="font-c54-normal text-c54-text-muted">
                  {entry.staff.department}
                </span>
                {active ? (
                  <span className="text-c54-2xs font-c54-medium text-c54-status-healthy">
                    Current holder
                  </span>
                ) : null}
              </p>
              <p className="mt-c54-1 text-c54-2xs text-c54-text-muted">
                {formatDay(entry.dateAssigned)}
                {entry.dateReturned ? ` → ${formatDay(entry.dateReturned)}` : " → present"}
                {entry.assignedBy ? ` · by ${entry.assignedBy.name}` : ""}
                {/* The return-side counterpart of "by": who accepted the asset
                    back, recorded from the session when the return was made. */}
                {entry.returnedBy && !active ? ` · accepted by ${entry.returnedBy.name}` : ""}
              </p>
              {entry.note ? (
                <p className="mt-c54-2 text-c54-xs text-c54-text-secondary">{entry.note}</p>
              ) : null}
              {entry.returnNote || entry.returnImageUrl ? (
                <div className="mt-c54-2 flex items-start gap-c54-3 rounded-c54-input border border-c54-border-default bg-c54-bg-muted/40 p-c54-3">
                  {entry.returnImageUrl ? (
                    // A presigned storage URL is already a direct link; next/image
                    // would only add a second hop it cannot see the signature of.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.returnImageUrl}
                      alt={`Condition of the asset when ${entry.staff.name} returned it`}
                      className="h-16 w-16 shrink-0 rounded-c54-sm border border-c54-border-default object-cover"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="text-c54-2xs font-c54-semibold tracking-c54-widest text-c54-text-muted uppercase">
                      Return condition
                    </p>
                    {entry.returnNote ? (
                      <p className="mt-c54-1 text-c54-xs text-c54-text-secondary">
                        {entry.returnNote}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </VerticalTimelineElement>
          );
        })}
      </VerticalTimeline>
    </div>
  );
}

function formatDay(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}