import { z } from "zod";

import {
  assetIdentifierSchema,
  assetStatusSchema,
  nonEmptyRepeatedFormField,
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
  /**
   * Exact brand or model, from the filter dropdowns. Equality rather than
   * `contains`: these come from values that already exist on the register, so
   * there is nothing to fuzzy-match against and a partial match would only
   * produce surprising near-misses ("Del" matching "Dell" and "Delsey").
   */
  brand: z.string().trim().min(1).max(100).optional(),
  model: z.string().trim().min(1).max(100).optional(),
});

/** Required on registration: without a brand the item cannot be identified. */
const requiredBrandSchema = z
  .string()
  .trim()
  .min(1, "brand is required")
  .max(100, "brand must be <= 100 characters");

/** Required on registration: the serial is what makes the item findable again. */
const requiredSerialSchema = z
  .string()
  .trim()
  .min(1, "serialNumber is required")
  .max(120, "serial must be <= 120 characters");

export const createAssetSchema = z.object({
  /** Asset type code (LAP) or id. */
  assetType: z.string().trim().min(1, "assetType is required").max(64),
  name: z
    .string()
    .trim()
    .min(1, "name is required")
    .max(500, "name must be <= 500 characters"),
  brand: requiredBrandSchema,
  /** Optional; "" and whitespace are stored as NULL. */
  model: z.string().trim().max(100, "model must be <= 100 characters").nullish(),
  serialNumber: requiredSerialSchema,
  status: z.enum(["AVAILABLE", "UNDER_REPAIR", "RETIRED"]).default("AVAILABLE"),
});

/**
 * One row of a batch register: a single physical item being entered.
 *
 * Same shape as `createAssetSchema`, not a reduced copy of it. There is no `unit`
 * field anywhere in this app: one row is one physical item, so the quantity typed
 * up front is a count of rows to enter, never a per-row count.
 *
 * `serialNumber` is the only thing that genuinely varies between rows of the same
 * batch, which is why each save carries its own.
 */
export const bulkAssetEntrySchema = z
  .object({
    /** Asset type code (LAP) or id. Shared by every row in the batch. */
    assetType: z.string().trim().min(1, "assetType is required").max(64),
    name: z.string().trim().min(1, "name is required").max(500, "name must be <= 500 characters"),
    brand: requiredBrandSchema,
    /** Optional; "" and whitespace are stored as NULL. */
    model: z.string().trim().max(100, "model must be <= 100 characters").nullish(),
    /**
     * Required, because saving a row individually means saving *that* item: the
     * sheet's "Save and next" is disabled until the row has a serial. A row
     * with no serial is skipped rather than refused, which is the batch
     * submission's business, not this one's.
     */
    serialNumber: requiredSerialSchema,
    status: z.enum(["AVAILABLE", "UNDER_REPAIR", "RETIRED"]).default("AVAILABLE"),
  })
  .strict();

/** How many items one batch register may cover. */
export const BULK_ASSET_ENTRY_MAX = 500;

/**
 * A whole column of serials submitted in one go.
 *
 * Blank entries are dropped rather than rejected. The sheet renders one input per
 * item, so a half-filled column legitimately submits empty strings, and refusing
 * the batch over the gaps somebody has not reached yet would make it impossible
 * to submit early. Emptiness is a UI concern here; the server only cares about the
 * serials that were actually filled in.
 */
export const bulkAssetSubmitSchema = z
  .object({
    /** Asset type code (LAP) or id. Shared by every row in the batch. */
    assetType: z.string().trim().min(1, "assetType is required").max(64),
    name: z
      .string()
      .trim()
      .min(1, "name is required")
      .max(500, "name must be <= 500 characters"),
    brand: requiredBrandSchema,
    /** Optional; "" and whitespace are stored as NULL. */
    model: z.string().trim().max(100, "model must be <= 100 characters").nullish(),
    /** In the order they should be created, so asset ids run down the column. */
    serials: nonEmptyRepeatedFormField("Enter at least one serial number").refine(
      (values) => values.length <= BULK_ASSET_ENTRY_MAX,
      "too many rows submitted",
    ),
    status: z.enum(["AVAILABLE", "UNDER_REPAIR", "RETIRED"]).default("AVAILABLE"),
  })
  .strict();

export const updateAssetSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "name is required")
      .max(500, "name must be <= 500 characters")
      .optional(),
    brand: z.string().trim().max(100, "brand must be <= 100 characters").nullish(),
  /** Optional; "" and whitespace are stored as NULL. */
  model: z.string().trim().max(100, "model must be <= 100 characters").nullish(),
    serialNumber: optionalTrimmedString.optional(),
    /** ASSIGMED is reserved: status flips through the assignments endpoints. */
    status: z.enum(["AVAILABLE", "UNDER_REPAIR", "RETIRED"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one of: name, brand, model, serialNumber, status",
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

/**
 * What an ASSIGNER may set through the status-only path.
 *
 * Narrower than `updateAssetStatusSchema` on purpose, and the distinction is not
 * cosmetic. Retiring is a `asset:manage` operation — the matrix puts CRUD and
 * retire together at ADMIN — while flagging something broken and putting it back
 * in the pool is the everyday work an ASSIGNER does. Letting the wider schema
 * through on the assigner path meant `{"status":"RETIRED"}` retired an asset
 * through an endpoint the UI never offers it on: the detail page passes
 * `canChangeStatus={canManage}`, so the control is ADMIN-only, but the route and
 * the Server Action both admitted any ASSIGNER and the permission matrix never
 * got a say.
 *
 * Declared as a second schema rather than a runtime check so the refusal is a
 * validation error on the one field it concerns, instead of a 403 that says
 * nothing about which value was the problem.
 */
export const assignerAssetStatusSchema = z
  .object({
    status: z.enum(["AVAILABLE", "UNDER_REPAIR"]),
  })
  .strict();

export const assetIdParamSchema = z.object({
  id: assetIdentifierSchema,
});

export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type BulkAssetSubmitInput = z.infer<typeof bulkAssetSubmitSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type UpdateAssetStatusInput = z.infer<typeof updateAssetStatusSchema>;