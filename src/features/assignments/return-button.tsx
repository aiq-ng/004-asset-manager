"use client";

import { useActionState, useState } from "react";

import { returnAssetAction } from "@/features/assets/actions";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Icons } from "@/components/ui/icons";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";

/**
 * Record the return of an assigned asset.
 *
 * Confirmation is not optional here: `returnAssignment` closes the assignment
 * row, and there is no way to reopen it — a mistake means creating a new
 * assignment instead.
 */
export function ReturnButton({ assignmentId, assetId }: { assignmentId: string; assetId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(returnAssetAction, INITIAL_ACTION_STATE);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Icons.Refresh className="size-3.5" />
        <span className="sr-only sm:not-sr-only">Return</span>
      </Button>

      <ConfirmDialog
        open={open && !state.ok}
        onClose={() => setOpen(false)}
        title="Record this return?"
        description={`${assetId} comes back and becomes available again. The assignment is closed permanently.`}
        confirmLabel="Record return"
        variant="secondary"
        action={action}
        fields={{ assignmentId }}
      >
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      </ConfirmDialog>
    </>
  );
}