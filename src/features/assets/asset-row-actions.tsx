"use client";

import { useActionState, useState } from "react";
import { Ellipsis, ExternalLink, Plus, QrCode, Wrench } from "lucide-react";

import { retireAssetAction, updateAssetStatusAction } from "@/features/assets/actions";
import { AssignAssetDialog } from "@/features/assets/assign-asset-dialog";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import {
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
} from "@/components/ui/dropdown-menu";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";
import type { StaffListOption } from "@/features/staff/types";

/**
 * Per-row actions for an asset.
 *
 * A client island rather than a column of links, because the destructive choices
 * need a confirmation step and the status changes need pending state. Which items
 * appear is decided by the server, which already knows the actor's role — the
 * client never decides whether an action is allowed.
 */
export function AssetRowActions({
  assetId,
  status,
  assigned,
  canManage,
  canAssign,
  canUpdateStatus,
  staff,
}: {
  assetId: string;
  status: string;
  assigned: boolean;
  canManage: boolean;
  canAssign: boolean;
  canUpdateStatus: boolean;
  /** Only needed when `canAssign`; keeps the list small for everyone else. */
  staff?: StaffListOption[];
}) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [repairState, repairAction] = useActionState(updateAssetStatusAction, INITIAL_ACTION_STATE);
  const [retireState, retireAction] = useActionState(retireAssetAction, INITIAL_ACTION_STATE);
  const [retireOpen, setRetireOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);

  const settable = status !== "ASSIGNED" && status !== "RETIRED";
  const isRepairing = status === "UNDER_REPAIR";

  return (
    <>
      <DropdownMenu
        trigger={(trigger) => (
          <button
            type="button"
            id={trigger.id}
            onClick={trigger.toggle}
            aria-haspopup={trigger["aria-haspopup"]}
            aria-expanded={trigger["aria-expanded"]}
            aria-label={`Actions for ${assetId}`}
            className="inline-flex size-7 items-center justify-center rounded-c54-sm text-c54-text-muted transition-colors hover:bg-c54-action-ghost-hover hover:text-c54-text-primary"
          >
            <Ellipsis />
          </button>
        )}
      >
        <DropdownLabel>{assetId}</DropdownLabel>

        <DropdownItem href={`/assets/${assetId}`}>
          <ExternalLink className="size-3.5" />
          Open details
        </DropdownItem>

        <DropdownItem href={`/assets/${assetId}/label`}>
          <QrCode className="size-3.5" />
          Print label
        </DropdownItem>

        {canAssign && !assigned && status === "AVAILABLE" ? (
          <>
            <DropdownSeparator />
            <DropdownItem onClick={() => setAssignOpen(true)}>
              <Plus className="size-3.5" />
              Assign to staff
            </DropdownItem>
          </>
        ) : null}

        {canUpdateStatus && settable ? (
          <>
            <DropdownSeparator />
            <DropdownItem onClick={() => setRepairOpen(true)}>
              <Wrench />
              {isRepairing ? "Mark available" : "Send for repair"}
            </DropdownItem>
          </>
        ) : null}

        {canManage && settable ? (
          <>
            <DropdownSeparator />
            <DropdownItem danger onClick={() => setRetireOpen(true)}>
              Retire asset
            </DropdownItem>
          </>
        ) : null}
      </DropdownMenu>

      {staff ? (
        <AssignAssetDialog
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          assetId={assetId}
          staff={staff}
        />
      ) : null}

      <ConfirmDialog
        open={repairOpen && !repairState.ok}
        onClose={() => setRepairOpen(false)}
        title={isRepairing ? "Mark as available?" : "Send for repair?"}
        description={
          isRepairing
            ? `${assetId} will become available for assignment.`
            : `${assetId} will be taken out of circulation until it is marked available again.`
        }
        confirmLabel={isRepairing ? "Mark available" : "Send for repair"}
        variant="secondary"
        action={repairAction}
        fields={{ assetId, status: isRepairing ? "AVAILABLE" : "UNDER_REPAIR" }}
      >
        {repairState.error ? <Alert tone="danger">{repairState.error}</Alert> : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={retireOpen && !retireState.ok}
        onClose={() => setRetireOpen(false)}
        title="Retire this asset?"
        description={
          assigned
            ? `${assetId} is currently assigned. Return it to staff first. Retirement is blocked until then.`
            : `${assetId} will be withdrawn from the register. It stays in the database and in the audit trail, and can be recorded as available again later.`
        }
        confirmLabel="Retire asset"
        action={retireAction}
        fields={{ assetId }}
      >
        {retireState.error ? <Alert tone="danger">{retireState.error}</Alert> : null}
      </ConfirmDialog>
    </>
  );
}