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

/**
 * A repeated form field, normalised to a list of non-empty trimmed strings.
 *
 * `formDataToObject` only starts collecting an array on the *second* occurrence of
 * a key, so the same name submits as a bare string when there is exactly one value
 * and as an array when there are two or more. A schema written as `z.array()`
 * therefore passes a batch of five and rejects a batch of one — the failure lands
 * on the smallest and most common submission, which is the worst place for it.
 *
 * Accepting both shapes here means callers do not have to know that. Blank entries
 * are dropped rather than rejected, because a form rendering one input per row
 * submits empty strings for the rows nobody has reached yet.
 */
export const repeatedFormField = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value : [value]))
  .refine(
    (values) => values.every((value) => value.trim().length <= 120),
    "value must be <= 120 characters",
  )
  .transform((values) => values.map((value) => value.trim()).filter((value) => value.length > 0));

/** As `repeatedFormField`, but requires at least one non-empty entry. */
export function nonEmptyRepeatedFormField(message = "Enter at least one value") {
  return repeatedFormField.refine((values) => values.length > 0, message);
}

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