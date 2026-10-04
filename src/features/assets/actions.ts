"use server";

import { refresh } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { defineAction, actionRequestContext, toFailure } from "@/lib/server/define-action";
import {
  createAsset,
  createAssetsInBulk,
  removeAssetImage,
  replaceAssetImage,
  retireAsset,
  updateAsset,
  type BulkAssetResult,
} from "@/lib/services/assets";
import { createAssignment, returnAssignment } from "@/lib/services/assignments";
import { parseUploadedImage } from "@/lib/services/images";
import type { AssetDto } from "@/lib/services/serializers";
import {
  bulkAssetEntrySchema,
  bulkAssetSubmitSchema,
  createAssetSchema,
  updateAssetSchema,
  updateAssetStatusSchema,
} from "@/lib/validators/asset";
import { createAssignmentSchema, returnAssignmentSchema } from "@/lib/validators/assignment";
import { ApiError } from "@/lib/errors";
import { runWithRequestContext } from "@/lib/audit/context";
import { can, requirePermission } from "@/lib/auth/permissions";
import { getActor } from "@/lib/auth/actor";
import {
  formDataToObject,
  submittedValues,
  toFieldErrors,
  type ActionState,
} from "@/lib/server/action-state";
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

/**
 * Registers a new asset, with an optional photo taken at intake.
 *
 * Hand-rolled rather than `defineAction` for the same reason the image actions
 * are: the photo arrives as a `File` in the `FormData`, and the shared
 * `formDataToObject` drops non-string entries by design. The guarantees match
 * the factory — actor, permission, audit context, serialisable failures — plus
 * the redirect to the record just created, which also makes a reload unable to
 * resubmit the form.
 *
 * The image goes on *after* the row exists, through the same `replaceAssetImage`
 * path the detail page uses, so there is exactly one implementation of
 * upload-then-point-then-cleanup to reason about. A failure there leaves the
 * asset registered and photo-less rather than half-created.
 */
export async function createAssetAction(
  _previousState: ActionState<AssetDto>,
  formData: FormData,
): Promise<ActionState<AssetDto>> {
  try {
    const actor = await getActor();
    if (!actor) throw ApiError.unauthenticated("Your session has expired. Please sign in again.");
    requirePermission(actor, "asset:manage");

    const input = createAssetSchema.parse(formDataToObject(formData));

    const file = formData.get("file");
    const image =
      file instanceof File && file.size > 0 ? await parseUploadedImage(file) : undefined;

    const created = await runWithRequestContext(
      await actionRequestContext("action:createAsset", actor),
      async () => {
        const created = await createAsset(input);
        if (image) await replaceAssetImage(created.assetId, image);
        return created;
      },
    );

    // Land on the record just created; redirecting also means a reload cannot
    // resubmit the form.
    redirect(`/assets/${created.assetId}`);
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: "Please correct the highlighted fields.",
        fieldErrors: toFieldErrors(error),
        values: submittedValues(formData),
      };
    }

    return toFailure(error, formData);
  }
}

/**
 * Creates one row of a batch register.
 *
 * The difference from `createAssetAction` is the absence of a `redirect`. That
 * action lands on the new record so a reload cannot resubmit; here the sheet has
 * to stay open for the next of the person's items, and a redirect would throw
 * the sheet away after the first save and strand them at item one of twenty.
 * `revalidate` stays on, so every save re-renders the register behind the sheet
 * and the row appears as it is entered.
 *
 * Nothing about the quantity is passed through: in this flow it is the number of
 * rows being entered, and each of those rows is a single physical item.
 */
/**
 * Creates one row of a batch register, with the batch's photo if there is one.
 *
 * Hand-rolled rather than `defineAction` for the same reason `createAssetAction`
 * is: the photo arrives as a `File`, and the shared `formDataToObject` drops
 * non-string entries by design. The guarantees match the factory — actor,
 * permission, audit context, serialisable failures, `refresh` — so the sheet can
 * stay open and keep counting.
 *
 * Only one row exists at this point, so `replaceAssetImage` is the right tool and
 * the audit trail gets one image event per save, which is proportionate to a save
 * the operator took one at a time.
 */
export async function createBulkAssetEntryAction(
  _previousState: ActionState<AssetDto>,
  formData: FormData,
): Promise<ActionState<AssetDto>> {
  try {
    const actor = await getActor();
    if (!actor) throw ApiError.unauthenticated("Your session has expired. Please sign in again.");
    requirePermission(actor, "asset:manage");

    const input = bulkAssetEntrySchema.parse(formDataToObject(formData));

    const file = formData.get("file");
    const image = file instanceof File && file.size > 0 ? await parseUploadedImage(file) : undefined;

    const created = await runWithRequestContext(
      await actionRequestContext("action:createBulkAssetEntry", actor),
      async () => {
        const created = await createAsset(input);
        if (image) await replaceAssetImage(created.assetId, image);
        return created;
      },
    );

    // `defineAction` did this for the sheet before it was hand-rolled: every save
    // re-renders the register behind it, so the row appears as it is entered.
    refresh();
    return { ok: true, data: created, error: "", message: "Item registered." };
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: "Please correct the highlighted fields.",
        fieldErrors: toFieldErrors(error),
        values: submittedValues(formData),
      };
    }

    return toFailure(error, formData);
  }
}

/**
 * Registers the whole filled-in column in one submission.
 *
 * `createBulkAssetEntryAction` is the durable path — one item, saved, impossible
 * to lose. This is the fast path for someone who has the sheet in front of them:
 * they type every serial, press Submit once, and the register fills in a single
 * round trip instead of a hundred.
 *
 * No redirect, for the same reason: the sheet still has to show what was created
 * and what was refused, which is the whole point of the response.
 */
export async function submitBulkAssetEntryAction(
  _previousState: ActionState<BulkAssetResult>,
  formData: FormData,
): Promise<ActionState<BulkAssetResult>> {
  try {
    const actor = await getActor();
    if (!actor) throw ApiError.unauthenticated("Your session has expired. Please sign in again.");
    requirePermission(actor, "asset:manage");

    const input = bulkAssetSubmitSchema.parse(formDataToObject(formData));

    const file = formData.get("file");
    const image = file instanceof File && file.size > 0 ? await parseUploadedImage(file) : undefined;

    const result = await runWithRequestContext(
      await actionRequestContext("action:submitBulkAssetEntry", actor),
      async () => createAssetsInBulk(input, image),
    );

    refresh();
    return { ok: true, data: result, error: "", message: "Registered." };
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: "Please correct the highlighted fields.",
        fieldErrors: toFieldErrors(error),
        values: submittedValues(formData),
      };
    }

    return toFailure(error, formData);
  }
}

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
/**
 * The narrow status-only path an ASSIGNER is allowed.
 *
 * The status is range-checked against the actor here rather than by narrowing
 * the schema, because `defineAction` takes one schema for every caller and the
 * schema alone cannot know who is submitting. `RETIRED` is the one value that
 * matters: it is a `asset:manage` operation, so an ASSIGNER reaching it through
 * this action would be the same escalation the REST route had, reached by a
 * different door. Refused with the permission message rather than a validation
 * one, because the request was well-formed — the caller simply is not allowed to
 * make it.
 */
export const updateAssetStatusAction = defineAction(
  assetRefSchema.extend(updateAssetStatusSchema.shape),
  ({ assetId, status }, actor) => {
    if (status === "RETIRED" && !can(actor.role, "asset:manage")) {
      throw ApiError.forbidden("Retiring an asset requires admin rights");
    }
    return updateAsset(assetId, { status });
  },
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

/**
 * Records a return, with the condition note and photo the dialog captures.
 *
 * Hand-rolled like the image actions: the note is a plain string, but the photo
 * is a `File`, which `defineAction`'s FormData parsing drops. The permission
 * check, audit context and serialisable failures match the factory.
 *
 * `returnedById` — the "return accepted by" record the UI shows on the history
 * timeline — is set inside the service from the authenticated actor, never from
 * client input.
 */
export async function returnAssetAction(
  _previousState: ActionState<undefined>,
  formData: FormData,
): Promise<ActionState<undefined>> {
  try {
    const actor = await getActor();
    if (!actor) throw ApiError.unauthenticated("Your session has expired. Please sign in again.");
    requirePermission(actor, "assignment:return");

    const { assignmentId } = returnRefSchema.parse({
      assignmentId: formData.get("assignmentId"),
    });

    const rawNote = formData.get("returnNote");
    const { returnNote } = returnAssignmentSchema.parse({
      returnNote: typeof rawNote === "string" ? rawNote : undefined,
    });

    const file = formData.get("file");
    const image =
      file instanceof File && file.size > 0 ? await parseUploadedImage(file) : undefined;

    await runWithRequestContext(await actionRequestContext("action:returnAssignment", actor), () =>
      returnAssignment(assignmentId, { returnNote, image }, actor),
    );

    refresh();
    return { ok: true, error: "", message: "Return recorded." };
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: "Please correct the highlighted fields.",
        fieldErrors: toFieldErrors(error),
        values: submittedValues(formData),
      };
    }

    return toFailure(error, formData);
  }
}

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

    return toFailure(error, formData);
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

    return toFailure(error, formData);
  }
}