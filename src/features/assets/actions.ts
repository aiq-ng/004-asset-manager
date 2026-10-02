"use server";

import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { defineAction, toFailure } from "@/lib/server/define-action";
import {
  createAsset,
  removeAssetImage,
  replaceAssetImage,
  retireAsset,
  updateAsset,
} from "@/lib/services/assets";
import { createAssignment, returnAssignment } from "@/lib/services/assignments";
import { parseUploadedImage } from "@/lib/services/images";
import {
  createAssetSchema,
  updateAssetSchema,
  updateAssetStatusSchema,
} from "@/lib/validators/asset";
import { createAssignmentSchema } from "@/lib/validators/assignment";
import { ApiError } from "@/lib/errors";
import { runWithRequestContext } from "@/lib/audit/context";
import { requirePermission } from "@/lib/auth/permissions";
import { getActor } from "@/lib/auth/actor";
import type { ActionState } from "@/lib/server/action-state";
import { z } from "zod";

/**
 * Asset and assignment mutations, as Server Actions.
 *
 * This file is the `"use server"` boundary the asset forms import. Everything
 * behind it — the actor check, the permission check, the audit context, the Zod
 * validation and the post-write refresh — is applied by `defineAction`, so a new
 * mutation here is a schema plus a service call and nothing else.
 */

/** Hidden input carrying the asset identifier; the services accept `IT-LAP-0001` or a cuid. */
const assetRefSchema = z.object({
  assetId: z.string().trim().min(1, "assetId is required").max(64),
});

const returnRefSchema = z.object({
  assignmentId: z.string().trim().min(1, "assignmentId is required").max(64),
});

export const createAssetAction = defineAction(
  createAssetSchema,
  (input) => createAsset(input),
  {
    route: "action:createAsset",
    permission: "asset:manage",
    successMessage: "Asset registered.",
    // Land on the record just created; redirecting also means a reload cannot
    // resubmit the form.
    redirect: (created) => `/assets/${created.assetId}`,
  },
);

export const updateAssetAction = defineAction(
  updateAssetSchema.extend({ assetId: z.string().trim().min(1).max(64) }),
  ({ assetId, ...input }) => updateAsset(assetId, input),
  { route: "action:updateAsset", permission: "asset:manage", successMessage: "Asset updated." },
);

/**
 * The narrow status-only path an ASSIGNER is allowed.
 *
 * `updateAssetStatusSchema` is `.strict()` so anything beyond `status` is a 400
 * rather than a silently ignored field; it is parsed here and handed to
 * `updateAsset`, which is the single place the status transition rules live.
 */
export const updateAssetStatusAction = defineAction(
  assetRefSchema.extend(updateAssetStatusSchema.shape),
  ({ assetId, status }) => updateAsset(assetId, { status }),
  {
    route: "action:updateAssetStatus",
    permission: "asset:updateStatus",
    successMessage: "Status updated.",
  },
);

export const retireAssetAction = defineAction(
  assetRefSchema,
  ({ assetId }) => retireAsset(assetId),
  { route: "action:retireAsset", permission: "asset:manage", successMessage: "Asset retired." },
);

export const assignAssetAction = defineAction(
  createAssignmentSchema,
  (input, actor) => createAssignment(input, actor),
  {
    route: "action:createAssignment",
    permission: "assignment:create",
    successMessage: "Asset assigned.",
  },
);

export const returnAssetAction = defineAction(
  returnRefSchema,
  ({ assignmentId }) => returnAssignment(assignmentId),
  {
    route: "action:returnAssignment",
    permission: "assignment:return",
    successMessage: "Return recorded.",
  },
);

/** Retire is a plain submit button, so it needs the form-only signature. */
export async function retireAssetFormAction(formData: FormData): Promise<void> {
  const result = await retireAssetAction({ ok: false, error: "" }, formData);
  if (!result.ok) throw new Error(result.error);
  refresh();
}

/** Hidden input carrying the asset identifier, as the other ref schemas. */
const assetImageRefSchema = z.object({
  assetId: z.string().trim().min(1, "assetId is required").max(64),
});

/**
 * Replace or set the asset's photo, as a `useActionState` action.
 *
 * This one cannot go through `defineAction`: the image is a `File`, and the
 * shared `formDataToObject` drops non-string entries by design (schemas would
 * all have to be unions to tolerate one). The hand-rolled body below keeps the
 * same guarantees the factory provides — actor, permission, audit context,
 * serialisable failures — while reading the file directly.
 */
export async function uploadAssetImageAction(
  _previousState: ActionState<undefined>,
  formData: FormData,
): Promise<ActionState<undefined>> {
  let assetId = "";

  try {
    const actor = await getActor();
    if (!actor) throw ApiError.unauthenticated("Your session has expired. Please sign in again.");
    requirePermission(actor, "asset:manage");

    const { assetId: parsedAssetId } = assetImageRefSchema.parse({
      assetId: formData.get("assetId"),
    });
    assetId = parsedAssetId;

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw ApiError.badRequest("Choose an image to upload", [
        { path: "file", message: "file is required" },
      ]);
    }

    // Magic-byte sniffing and the size limit are enforced here, so a crafted
    // upload is rejected before it ever reaches the storage layer.
    const image = await parseUploadedImage(file);

    await runWithRequestContext(
      {
        actor,
        ipAddress: null,
        userAgent: null,
        route: "action:uploadAssetImage",
      },
      () => replaceAssetImage(assetId, image),
    );

    refresh();
    return { ok: true, error: "", message: "Image updated." };
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof z.ZodError) {
      return { ok: false, error: "Please correct the highlighted fields." };
    }

    return toFailure(error);
  }
}

/** Clears the asset's photo. Confirmation lives in the dialog that calls it. */
export async function removeAssetImageAction(
  _previousState: ActionState<undefined>,
  formData: FormData,
): Promise<ActionState<undefined>> {
  let assetId = "";

  try {
    const actor = await getActor();
    if (!actor) throw ApiError.unauthenticated("Your session has expired. Please sign in again.");
    requirePermission(actor, "asset:manage");

    const parsed = assetImageRefSchema.parse({ assetId: formData.get("assetId") });
    assetId = parsed.assetId;

    await runWithRequestContext(
      {
        actor,
        ipAddress: null,
        userAgent: null,
        route: "action:removeAssetImage",
      },
      () => removeAssetImage(assetId),
    );

    refresh();
    return { ok: true, error: "", message: "Image removed." };
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof z.ZodError) {
      return { ok: false, error: "Please correct the highlighted fields." };
    }

    return toFailure(error);
  }
}