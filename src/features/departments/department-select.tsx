"use client";

import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/controls";

export interface DepartmentOption {
  id: string;
  name: string;
}

/**
 * Department picker.
 *
 * A `<select>` over the departments that actually exist rather than a text field.
 * The point is not convenience: free text here is what let "IT", "it" and " IT "
 * end up as three different departments, and no filter or picker can reconcile
 * that afterwards. Submitting an id the database recognises makes the bad state
 * unrepresentable.
 *
 * When there are no departments yet the control is disabled and says so, pointing
 * at where they are created, rather than rendering an empty box that submits
 * nothing and fails validation with a message nobody can act on.
 */
export function DepartmentSelect({
  departments,
  id,
  name,
  defaultValue,
  error,
  disabled = false,
}: {
  departments: DepartmentOption[];
  id: string;
  name: string;
  defaultValue?: string;
  error?: string;
  disabled?: boolean;
}) {
  const empty = departments.length === 0;

  return (
    <Field
      label="Department"
      htmlFor={id}
      error={error}
      hint={
        empty
          ? "No departments yet. Add one under Departments first."
          : "Pick from the departments in the register."
      }
      required
    >
      {(field) => (
        <Select
          {...field}
          id={id}
          name={name}
          defaultValue={defaultValue ?? ""}
          disabled={disabled || empty}
          invalid={Boolean(error)}
        >
          <option value="">Choose a department…</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}