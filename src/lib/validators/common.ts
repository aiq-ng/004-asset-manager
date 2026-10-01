import { z } from "zod";

import { PAGINATION_DEFAULT_PAGE_SIZE, PAGINATION_MAX_PAGE_SIZE } from "@/lib/config";

export const assetStatusSchema = z.enum([
  "AVAILABLE",
  "ASSIGNED",
  "UNDER_REPAIR",
  "RETIRED",
]);

/** Empty string, whitespace-only strings are normalised to null (nullable columns). */
export const optionalTrimmedString = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable();

export const paginationSchema = z.object({
  page: z.coerce
    .number()
    .int("page must be an integer")
    .min(1, "page must be >= 1")
    .default(1),
  pageSize: z.coerce
    .number()
    .int("pageSize must be an integer")
    .min(1, "pageSize must be >= 1")
    .max(PAGINATION_MAX_PAGE_SIZE, `pageSize must be <= ${PAGINATION_MAX_PAGE_SIZE}`)
    .default(PAGINATION_DEFAULT_PAGE_SIZE),
});

/** Cuid or human asset id (`IT-LAP-0001`). */
export const assetIdentifierSchema = z
  .string()
  .trim()
  .min(1, "Asset identifier is required")
  .max(64, "Asset identifier is too long");