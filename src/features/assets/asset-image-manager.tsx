"use client";

import { useActionState, useRef, useState } from "react";

import {
  removeAssetImageAction,
  uploadAssetImageAction,
} from "@/features/assets/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Icons } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";
import { IMAGE_UPLOAD_MAX_BYTES } from "@/lib/config";

const MAX_IMAGE_MB = IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024);

/**
 * The asset photo: preview, upload, remove.
 *
 * The file input is the whole upload UI rather than a staged crop flow — a
 * register photo is an identification aid, not a gallery. Validation happens
 * twice on purpose: the browser checks the extension cheaply for the user, and
 * the action sniffs the magic bytes before anything is stored.
 */
export function AssetImageManager({
  assetId,
  description,
  imageUrl,
  canManage,
}: {
  assetId: string;
  description: string;
  /** Presigned URL when the asset has a photo, null when it does not. */
  imageUrl: string | null;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [uploadState, uploadAction] = useActionState(uploadAssetImageAction, INITIAL_ACTION_STATE);
  const [removeState, removeAction] = useActionState(removeAssetImageAction, INITIAL_ACTION_STATE);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const justUploaded = uploadState.ok;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setSelectedName(file ? file.name : null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Photo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-c54-4">
        {imageUrl ? (
          // A presigned storage URL is already a direct link; `next/image` would
          // only add a second hop and a loader that cannot see the signature.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={description}
            className="h-44 w-full rounded-c54-card border border-c54-border-default object-cover"
          />
        ) : (
          <div className="flex h-28 items-center justify-center gap-c54-2 rounded-c54-card border border-dashed border-c54-border-strong bg-c54-bg-muted text-c54-xs text-c54-text-muted">
            <Icons.Image className="size-4" />
            No photo yet
          </div>
        )}

        {/* The presigned URL expires, so a stale success message would point at
            a dead link; showing errors only keeps the panel honest. */}
        {!justUploaded && uploadState.error ? (
          <Alert tone="danger">{uploadState.error}</Alert>
        ) : null}
        {!removeState.ok && removeState.error ? (
          <Alert tone="danger">{removeState.error}</Alert>
        ) : null}

        {canManage ? (
          <>
            <form
              ref={formRef}
              action={uploadAction}
              onSubmit={() => {
                // The dialog below can close over the panel: resetting the file
                // input after submit avoids a stale name next to a new preview.
                setSelectedName(null);
              }}
              className="flex flex-col gap-c54-3"
            >
              <input type="hidden" name="assetId" value={assetId} />

              <label className="flex cursor-pointer items-center justify-center gap-c54-2 rounded-c54-input border border-c54-border-default bg-c54-bg-card px-c54-3 py-c54-2 text-c54-sm text-c54-text-secondary transition-colors hover:border-c54-border-strong hover:text-c54-text-primary">
                <Icons.Upload className="size-3.5" />
                {selectedName ?? (imageUrl ? "Replace image" : "Choose an image")}
                <input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={handleFileChange}
                />
              </label>

              <p className="text-c54-2xs text-c54-text-muted">
                JPEG, PNG or WebP, up to {MAX_IMAGE_MB} MB. Uploading again replaces the current
                photo.
              </p>

              <SubmitButton
                pendingLabel="Uploading…"
                disabled={!selectedName}
                className="self-start"
              >
                Upload
              </SubmitButton>
            </form>

            {imageUrl ? (
              <div className="border-t border-c54-border-default pt-c54-4">
                <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
                  <Icons.Trash className="size-3.5" />
                  Remove photo
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-c54-2xs text-c54-text-muted">
            Photos are managed by admins.
          </p>
        )}
      </CardContent>

      <ConfirmDialog
        open={open && !removeState.ok}
        onClose={() => setOpen(false)}
        title="Remove this photo?"
        description={`The image file is deleted from storage. ${assetId} stays on the register.`}
        confirmLabel="Remove photo"
        variant="danger"
        action={removeAction}
        fields={{ assetId }}
      >
        {!removeState.ok && removeState.error ? (
          <Alert tone="danger">{removeState.error}</Alert>
        ) : null}
      </ConfirmDialog>
    </Card>
  );
}
