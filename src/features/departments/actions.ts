"use server";

import { defineAction } from "@/lib/server/define-action";
import {
  createDepartment,
  deleteDepartment,
  updateDepartment,
} from "@/lib/services/departments";
import {
  createDepartmentSchema,
  departmentIdParamSchema,
  updateDepartmentSchema,
} from "@/lib/validators/department";

/** Department mutations, behind the `department:manage` permission. */
export const createDepartmentAction = defineAction(
  createDepartmentSchema,
  (input) => createDepartment(input),
  {
    route: "action:createDepartment",
    permission: "department:manage",
    successMessage: "Department created.",
  },
);

export const updateDepartmentAction = defineAction(
  departmentIdParamSchema.and(updateDepartmentSchema),
  (input) => updateDepartment(input.id, { name: input.name }),
  {
    route: "action:updateDepartment",
    permission: "department:manage",
    successMessage: "Department renamed.",
  },
);

export const deleteDepartmentAction = defineAction(
  departmentIdParamSchema,
  ({ id }) => deleteDepartment(id),
  {
    route: "action:deleteDepartment",
    permission: "department:manage",
    successMessage: "Department deleted.",
  },
);