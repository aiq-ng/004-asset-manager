"use server";

import { defineAction } from "@/lib/server/define-action";
import { createStaff, deleteStaff, updateStaff } from "@/lib/services/staff";
import { createStaffSchema, updateStaffSchema } from "@/lib/validators/staff";
import { z } from "zod";

/** Staff mutations, behind `staff:manage`. */

const staffRefSchema = z.object({
  id: z.string().trim().min(1, "id is required").max(64),
});

export const createStaffAction = defineAction(
  createStaffSchema,
  (input) => createStaff(input),
  {
    route: "action:createStaff",
    permission: "staff:manage",
    successMessage: "Staff member created.",
    redirect: (created) => `/staff/${created.id}`,
  },
);

export const updateStaffAction = defineAction(
  staffRefSchema.extend(updateStaffSchema.shape),
  ({ id, ...input }) => updateStaff(id, input),
  {
    route: "action:updateStaff",
    permission: "staff:manage",
    successMessage: "Staff member updated.",
  },
);

/**
 * Delete a staff account, behind `staff:manage`.
 *
 * The service refuses while the person still holds assets or appears in
 * assignment history, so a failed delete here is a real precondition, not a
 * bug. On success the caller navigates to the directory, because the record
 * being viewed no longer exists.
 */
export const deleteStaffAction = defineAction(
  staffRefSchema,
  ({ id }) => deleteStaff(id),
  {
    route: "action:deleteStaff",
    permission: "staff:manage",
    successMessage: "Staff member deleted.",
    redirect: () => "/staff",
  },
);