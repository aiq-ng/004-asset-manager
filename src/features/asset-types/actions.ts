"use server";

import { defineAction } from "@/lib/server/define-action";
import { createAssetType, updateAssetType } from "@/lib/services/asset-types";
import {
  createAssetTypeSchema,
  updateAssetTypeSchema,
} from "@/lib/validators/asset-type";
import { z } from "zod";

/** Asset type mutations, behind the `assetType:manage` permission. */

const assetTypeRefSchema = z.object({
  id: z.string().trim().min(1, "id is required").max(64),
});

export const createAssetTypeAction = defineAction(
  createAssetTypeSchema,
  (input) => createAssetType(input),
  {
    route: "action:createAssetType",
    permission: "assetType:manage",
    successMessage: "Asset type created.",
  },
);

export const updateAssetTypeAction = defineAction(
  assetTypeRefSchema.extend(updateAssetTypeSchema.shape),
  ({ id, ...input }) => updateAssetType(id, input),
  {
    route: "action:updateAssetType",
    permission: "assetType:manage",
    successMessage: "Asset type updated.",
  },
);