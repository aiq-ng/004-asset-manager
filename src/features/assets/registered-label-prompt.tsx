"use client";

import Link from "next/link";
import { useState } from "react";
import { Printer } from "lucide-react";

import { buttonClassName } from "@/components/ui/button";
import { Dialog, DialogCancelButton } from "@/components/ui/dialog";
import { clearRegisteredPromptParam } from "@/features/assets/registered-prompt-param";

/**
 * Offered once, immediately after an asset is registered.
 *
 * A label is the thing that makes a new asset findable again — the tag that goes
 * on the box, with the QR back to this page — and the moment somebody has just
 * created an asset is the one moment they are certainly thinking about it. Left
 * to themselves they have to remember to come back for it, and an unlabelled
 * asset is exactly the kind that gets missed.
 *
 * So it is offered once and no more. Not a setting and not a permanent button on
 * the asset page — there already is one, "Print label", for anybody who wants it
 * later. This is the nudge at the right moment, and it goes away the moment it is
 * dismissed.
 *
 * It leads to the batch label run rather than the single-label page: that is the
 * screen that both prints and exports, so "create a label" and "create labels" are
 * the same two clicks either way and one destination serves both. See
 * `registered-prompt-param` for why the offer arrives as a query flag at all.
 */
export function RegisteredLabelPrompt({
  assetId,
  assetNumber,
}: {
  assetId: string;
  assetNumber: string;
}) {
  // Held rather than driven by the URL: the flag says "offer this once", and
  // dismissing it is a decision about this visit, not a navigation. Clearing the
  // query string as well means a reload or a back button does not raise it again.
  const [open, setOpen] = useState(true);

  if (!open) return null;

  function dismiss() {
    setOpen(false);
    clearRegisteredPromptParam();
  }

  return (
    <Dialog
      open
      onClose={dismiss}
      title={`${assetNumber} is on the register`}
      description="Labels are how an item gets found again — the tag on the box, with a QR back to this page."
      footer={
        <>
          <DialogCancelButton>Not now</DialogCancelButton>
          {/* A real link rather than a button with a router push: the labels screen
              is an ordinary page that works without JavaScript, and this is the
              only way out of the dialog that commits to anything. */}
          <Link
            href={`/assets/labels?ids=${assetId}`}
            className={buttonClassName("primary", "md")}
            onClick={clearRegisteredPromptParam}
          >
            <Printer className="size-4" />
            Create label
          </Link>
        </>
      }
    >
      <p className="text-c54-sm text-c54-text-secondary">
        Print it straight from your printer, or export the tag as a JPEG for the
        print shop — whichever you use, the label run does both.
      </p>
      <p className="mt-c54-2 text-c54-2xs text-c54-text-muted">
        You can always print this label later from the asset page.
      </p>
    </Dialog>
  );
}