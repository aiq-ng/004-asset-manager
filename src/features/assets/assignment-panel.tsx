"use client";

import { useActionState, useState } from "react";

import { returnAssetAction } from "@/features/assets/actions";
import { AssignAssetDialog } from "@/features/assets/assign-asset-dialog";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, DetailRow } from "@/components/ui/table";
import { Icons } from "@/components/ui/icons";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";
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
  const [open, setOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [state, action] = useActionState(returnAssetAction, INITIAL_ACTION_STATE);

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
          <>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <Icons.Refresh className="size-3.5" />
                Record return
              </Button>
            </div>

            <ConfirmDialog
              open={open && !state.ok}
              onClose={() => setOpen(false)}
              title="Record this return?"
              description={`${assignment.staff.name} hands the asset back and it becomes available again. The assignment is closed permanently — reopen it by assigning a new one.`}
              confirmLabel="Record return"
              variant="secondary"
              action={action}
              fields={{ assignmentId: assignment.id }}
            >
              {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
            </ConfirmDialog>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Full history of assignments, newest first. */
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
  }[];
}) {
  if (history.length === 0) {
    return (
      <p className="text-c54-sm text-c54-text-secondary">No assignments recorded yet.</p>
    );
  }

  return (
    <ol className="relative space-y-c54-4 border-l border-c54-border-default pl-c54-5">
      {history.map((entry) => {
        const active = entry.dateReturned === null;

        return (
          <li key={entry.id} className="relative">
            <span
              aria-hidden="true"
              className={`absolute top-1.5 -left-c54-6 size-2.5 rounded-c54-full border-2 border-c54-bg-card ${
                active ? "bg-c54-status-healthy" : "bg-c54-border-strong"
              }`}
            />
            <p className="text-c54-sm font-c54-medium text-c54-text-primary">
              {entry.staff.name}
              <span className="ml-c54-2 font-c54-normal text-c54-text-muted">
                {entry.staff.department}
              </span>
            </p>
            <p className="mt-c54-1 text-c54-2xs text-c54-text-muted">
              {formatDay(entry.dateAssigned)}
              {entry.dateReturned ? ` → ${formatDay(entry.dateReturned)}` : " → present"}
              {entry.assignedBy ? ` · by ${entry.assignedBy.name}` : ""}
            </p>
            {entry.note ? (
              <p className="mt-c54-2 text-c54-xs text-c54-text-secondary">{entry.note}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
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
