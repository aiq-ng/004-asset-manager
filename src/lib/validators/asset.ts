import { z } from "zod";

import {
  assetIdentifierSchema,
  assetStatusSchema,
  optionalTrimmedString,
  paginationSchema,
} from "@/lib/validators/common";

export const listAssetsQuerySchema = paginationSchema.extend({
  q: z
    .string()
    .trim()
    .min(1, "q must not be empty")
    .max(120, "q must be <= 120 characters")
    .optional(),
  /** Asset type code (LAP) or id. */
  type: z.string().trim().min(1).max(64).optional(),
  status: assetStatusSchema.optional(),
  /** Staff id: only assets currently assigned to that person. */
  assignedTo: z.string().trim().min(1).max(64).optional(),
});

export const createAssetSchema = z.object({
  /** Asset type code (LAP) or id. */
  assetType: z.string().trim().min(1, "assetType is required").max(64),
  description: z
    .string()
    .trim()
    .min(1, "description is required")
    .max(500, "description must be <= 500 characters"),
  unit: z.coerce
    .number()
    .int("unit must be an integer")
    .min(1, "unit must be >= 1")
    .default(1),
  /** Optional; "" and whitespace are stored as NULL. */
  serialNumber: optionalTrimmedString.optional(),
  status: z.enum(["AVAILABLE", "UNDER_REPAIR", "RETIRED"]).default("AVAILABLE"),
});

export const updateAssetSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1, "description is required")
      .max(500, "description must be <= 500 characters")
      .optional(),
    unit: z.coerce.number().int("unit must be an integer").min(1, "unit must be >= 1").optional(),
    serialNumber: optionalTrimmedString.optional(),
    /** ASSIGMED is reserved: status flips through the assignments endpoints. */
    status: z.enum(["AVAILABLE", "UNDER_REPAIR", "RETIRED"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one of: description, unit, serialNumber, status",
  });

/**
 * The narrow slice an ASSIGNER may change. `.strict()` turns "you may not edit
 * description" into a 400 listing the rejected fields instead of silently
 * ignoring them.
 */
export const updateAssetStatusSchema = z
  .object({
    status: z.enum(["AVAILABLE", "UNDER_REPAIR", "RETIRED"]),
  })
  .strict();

export const assetIdParamSchema = z.object({
  id: assetIdentifierSchema,
});

export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type UpdateAssetStatusInput = z.infer<typeof updateAssetStatusSchema>;