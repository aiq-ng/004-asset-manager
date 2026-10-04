"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { ReturnAssetDialog } from "@/features/assignments/return-asset-dialog";

/**
 * Record the return of an assigned asset, from a row in the assignments table.
 *
 * Confirmation is not optional here: a return closes the assignment row and
 * there is no way to reopen it — a mistake means creating a new assignment
 * instead. The sheet is the same one the asset detail page opens, mounted only
 * while `open` so that each return starts from a clean form.
 */
export function ReturnButton({
  assignmentId,
  assetId,
  holderName,
}: {
  assignmentId: string;
  assetId: string;
  holderName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Icons.Refresh className="size-3.5" />
        <span className="sr-only sm:not-sr-only">Return</span>
      </Button>

      {open ? (
        <ReturnAssetDialog
          assignmentId={assignmentId}
          assetId={assetId}
          holderName={holderName}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
