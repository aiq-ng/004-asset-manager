"use client";

import { useActionState, useState } from "react";
import { Archive } from "lucide-react";

import { retireAssetAction } from "@/features/assets/actions";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";

/**
 * Retire an asset from its detail page.
 *
 * The list-row menu already offers retire; this is the same mutation from the
 * record's own page, where somebody reviewing the details makes the decision.
 * Confirmation is not optional: the status change is not a delete, but bringing
 * a retired asset back is a manual edit, so the step makes the state change
 * deliberate.
 */
export function AssetRetireControl({
  assetId,
  status,
  assigned,
}: {
  assetId: string;
  status: string;
  /** The service refuses to retire an asset that is checked out. */
  assigned: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(retireAssetAction, INITIAL_ACTION_STATE);
  const repairing = status === "UNDER_REPAIR";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lifecycle</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-c54-3">
        {state.ok ? (
          <Alert tone="success">{state.message || "Asset retired."}</Alert>
        ) : state.error ? (
          <Alert tone="danger">{state.error}</Alert>
        ) : (
          <p className="text-c54-xs text-c54-text-secondary">
            {repairing
              ? "Retiring an asset under repair skips the repair queue. The record stays on the register and in the audit trail."
              : "Withdraw this asset from circulation. The record stays on the register and in the audit trail."}
          </p>
        )}

        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={assigned}
            title={assigned ? "Return the asset before retiring it" : undefined}
          >
            <Archive className="size-3.5" />
            Retire asset
          </Button>
        </div>

        {assigned ? (
          <p className="text-c54-2xs text-c54-text-warning">
            Currently assigned. Return it to staff first. Retirement is blocked until then.
          </p>
        ) : null}

        <ConfirmDialog
          open={open && !state.ok}
          onClose={() => setOpen(false)}
          title="Retire this asset?"
          description={`${assetId} will be withdrawn from the register. It stays in the database and in the audit trail.`}
          confirmLabel="Retire asset"
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
