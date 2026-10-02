import { z } from "zod";

/**
 * A department name is a label, not an identifier. It is trimmed and its inner
 * whitespace collapsed, so " IT " and "IT" are the same string before anything
 * else looks at it.
 *
 * The comment about case is worth being precise about, because the database does
 * *not* do it for us: Postgres `unique` on `text` compares case-sensitively, so
 * "IT" and "it" would happily coexist as two rows and show up as two separate
 * entries in every picker. The service layer is therefore responsible for
 * rejecting a case-insensitive duplicate before it reaches the insert; this
 * schema only handles the whitespace half.
 */
const departmentNameSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "name is required")
      .max(120, "name must be <= 120 characters"),
  );

export const createDepartmentSchema = z.object({
  name: departmentNameSchema,
});

export const updateDepartmentSchema = z.object({
  name: departmentNameSchema,
});

export const departmentIdParamSchema = z.object({
  id: z.string().trim().min(1, "Department id is required").max(64),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;