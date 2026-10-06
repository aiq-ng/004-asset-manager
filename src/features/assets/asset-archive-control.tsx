"use client";

import { useActionState, useState } from "react";
import { Archive } from "lucide-react";

import { archiveAssetAndLeaveAction } from "@/features/assets/actions";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";

/**
 * Archive a record from its own detail page.
 *
 * This is the "I registered the wrong thing" control, and it sits next to the
 * retirement card deliberately rather than replacing it. The two answer different
 * questions: retiring says a real device has left circulation and its record is
 * still true, while archiving says the record itself should not exist. Offering
 * both from the same page is what keeps somebody who means one from doing the
 * other.
 *
 * It uses the redirecting variant of the action because the page this control
 * lives on stops existing the moment it succeeds — `getAsset` filters archived
 * rows out, so a refresh would leave the operator staring at a 404 they caused on
 * purpose. Landing back on the register instead shows the row simply gone.
 */
export function AssetArchiveControl({
  assetId,
  assigned,
}: {
  assetId: string;
  /** The service refuses to archive an asset that is checked out. */
  assigned: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(archiveAssetAndLeaveAction, INITIAL_ACTION_STATE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Archive</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-c54-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <p className="text-c54-xs text-c54-text-secondary">
          Wrong record? Archiving takes {assetId} off the register for everyone and leaves it in the
          archive, where only admins can see it. The asset id stays spent, so nothing else can be
          given it later.
        </p>

        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={assigned}
            title={assigned ? "Return the asset before archiving it" : undefined}
          >
            <Archive className="size-3.5" />
            Archive record
          </Button>
        </div>

        {assigned ? (
          <p className="text-c54-2xs text-c54-text-warning">
            Currently assigned. Return it to staff first. Archiving is blocked until then.
          </p>
        ) : null}

        <ConfirmDialog
          open={open && !state.ok}
          onClose={() => setOpen(false)}
          title="Archive this record?"
          description={`${assetId} will leave the register and stop appearing on the dashboard, in assignment lists and on the public tag page. The row and its history are kept, and the archive and audit trail record who archived it.`}
          confirmLabel="Archive record"
          variant="danger"
          action={action}
          fields={{ assetId }}
        >
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        </ConfirmDialog>
      </CardContent>
    </Card>
  );
}