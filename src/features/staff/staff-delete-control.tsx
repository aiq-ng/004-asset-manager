"use client";

import { useActionState, useState } from "react";
import { Trash } from "lucide-react";

import { deleteStaffAction } from "@/features/staff/actions";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";

/**
 * Delete a staff account.
 *
 * Confirmation is mandatory: deletion removes the account and its sign-in
 * ability outright, and while assignment history keeps the audit trail intact,
 * the account itself does not come back. The service enforces the preconditions
 * (no assets held, no history, never the superadmin), so the dialog only has to
 * explain them.
 */
export function StaffDeleteControl({
  staff,
}: {
  staff: {
    id: string;
    name: string;
    email: string;
    role: string;
    holdingCount: number;
    historyCount: number;
  };
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(deleteStaffAction, INITIAL_ACTION_STATE);

  const blocked =
    staff.role === "SUPERADMIN" || staff.holdingCount > 0 || staff.historyCount > 0;

  const reason =
    staff.role === "SUPERADMIN"
      ? "The superadmin account cannot be deleted."
      : staff.holdingCount > 0
        ? "This person currently holds assets. Return them first."
        : staff.historyCount > 0
          ? "This person appears in assignment history, which is never deleted."
          : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Danger zone</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-c54-3">
        {state.ok ? null : state.error ? (
          <Alert tone="danger">{state.error}</Alert>
        ) : blocked && reason ? (
          <Alert tone="warning">{reason}</Alert>
        ) : null}

        <p className="text-c54-xs text-c54-text-secondary">
          Deletes the account for good. The person can no longer sign in or hold assets.
          Assignment history is kept for the audit trail.
        </p>

        <div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={blocked}
          >
            <Trash className="size-3.5" />
            Delete account
          </Button>
        </div>

        <ConfirmDialog
          open={open && !state.ok}
          onClose={() => setOpen(false)}
          title={`Delete ${staff.name}?`}
          description={`${staff.email} will lose access immediately. This cannot be undone.`}
          confirmLabel="Delete account"
          variant="danger"
          action={action}
          fields={{ id: staff.id }}
        >
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        </ConfirmDialog>
      </CardContent>
    </Card>
  );
}
