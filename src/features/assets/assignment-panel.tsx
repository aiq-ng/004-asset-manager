"use client";

import { useState } from "react";
import { VerticalTimeline, VerticalTimelineElement } from "react-vertical-timeline-component";
import { Plus, RefreshCw } from "lucide-react";
import "react-vertical-timeline-component/style.min.css";

import { AssignAssetDialog } from "@/features/assets/assign-asset-dialog";
import { ReturnAssetDialog } from "@/features/assignments/return-asset-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, DetailRow } from "@/components/ui/table";
import type { StaffListOption } from "@/features/staff/types";

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
  lastReturn,
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
  /**
   * The most recent *closed* assignment, so an asset sitting in the rack can say
   * who had it and when it came back instead of only "not assigned". Null for an
   * asset that has never been out.
   */
  lastReturn?: {
    dateReturned: string;
    staff: { name: string; department: string };
    returnNote: string | null;
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
    assetId: string;
    holderName: string;
  } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  // Mounted only while open, so each return is a fresh form and the previous
  // one's action state can never leak into the next.
  //
  // Keyed on the assignment id. Recording a return calls `refresh()`, which
  // re-renders this panel with `assignment` now null — so the branch below
  // swaps *while the sheet is still animating out*. React reconciles the two
  // branches positionally, and the sheet's position differs between them
  // (`CardContent`'s last child in one, a sibling of `CardContent` in the
  // other), so it was being unmounted and remounted mid-exit. A remount resets
  // `useActionState` to its initial value, `DialogCloseOnSuccess` never fires,
  // and the sheet reopened over the asset it had just returned. Hoisting it out
  // of the branch entirely, as a sibling of the whole `Card`, gives it one
  // position in both branches; the key is belt-and-braces against the panel
  // being handed a genuinely different assignment later.
  const returnDialog = returnTarget ? (
    <ReturnAssetDialog
      key={returnTarget.assignmentId}
      assignmentId={returnTarget.assignmentId}
      assetId={returnTarget.assetId}
      holderName={returnTarget.holderName}
      onClose={() => setReturnTarget(null)}
    />
  ) : null;

  const assignControl =
    canAssign && assetId && assetStatus === "AVAILABLE" && staff ? (
      <div>
        <Button size="sm" onClick={() => setAssignOpen(true)}>
          <Plus className="size-3.5" />
          Assign to staff
        </Button>
        <AssignAssetDialog
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          assetId={assetId}
          staff={staff}
        />
      </div>
    ) : null;

  // Nothing is out. This is a different card, not a version of the one above
  // with the rows blanked out: the holder rows would be a record of a closed
  // assignment sitting under a heading that claims it is current, and the Record
  // return button has no row left to act on. What is worth showing instead is
  // who had it last and what condition it came back in.
  if (!assignment) {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle>Assignment</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-c54-4">
            <div className="flex items-center gap-c54-2">
              <span className="text-c54-sm font-c54-medium text-c54-text-primary">
                Not currently assigned
              </span>
              {assetStatus === "AVAILABLE" ? (
                <span className="text-c54-2xs font-c54-medium text-c54-status-healthy">
                  Available
                </span>
              ) : null}
            </div>

            {lastReturn ? (
              <DescriptionList>
                <DetailRow term="Last held by">
                  <span className="text-c54-sm">{lastReturn.staff.name}</span>
                  <span className="block text-c54-2xs text-c54-text-muted">
                    {lastReturn.staff.department}
                  </span>
                </DetailRow>
                <DetailRow term="Returned">{formatDay(lastReturn.dateReturned)}</DetailRow>
                {lastReturn.returnNote ? (
                  <DetailRow term="Condition" className="sm:col-span-2">
                    {lastReturn.returnNote}
                  </DetailRow>
                ) : null}
              </DescriptionList>
            ) : (
              <p className="text-c54-sm text-c54-text-secondary">
                This asset has not been assigned to anybody yet.
              </p>
            )}

            {assignControl}
          </CardContent>
        </Card>

        {returnDialog}
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Assignment</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-c54-4">
          <DescriptionList>
            <DetailRow term="Holder">
              <span className="font-c54-medium">{assignment.staff.name}</span>
              <span className="block text-c54-2xs text-c54-text-muted">
                {assignment.staff.department}
              </span>
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

          {/* Gated on `assetId` as well as permission: the sheet names the asset it
              is returning, so it cannot open without one. Same rule as the assign
              control above. */}
          {canReturn && assetId ? (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setReturnTarget({
                    assignmentId: assignment.id,
                    assetId,
                    holderName: assignment.staff.name,
                  })
                }
              >
                <RefreshCw className="size-3.5" />
                Record return
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {returnDialog}
    </>
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
              icon={active ? <Plus /> : <RefreshCw />}
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