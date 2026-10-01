import { z } from "zod";

import { assetIdentifierSchema, paginationSchema } from "@/lib/validators/common";

export const createAssignmentSchema = z.object({
  /** Human asset id (`IT-LAP-0001`) or database id. */
  assetId: assetIdentifierSchema,
  staffId: z.string().trim().min(1, "staffId is required").max(64),
  note: z
    .string()
    .trim()
    .max(500, "note must be <= 500 characters")
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
});

export const listAssignmentsQuerySchema = paginationSchema.extend({
  assetId: z.string().trim().min(1).max(64).optional(),
  staffId: z.string().trim().min(1).max(64).optional(),
  /** "true" returns only assignments with dateReturned = null. */
  active: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const assignmentIdParamSchema = z.object({
  id: z.string().trim().min(1, "Assignment id is required").max(64),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>;