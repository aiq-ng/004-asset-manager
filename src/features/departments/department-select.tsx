"use client";

import { Field } from "@/components/ui/field";
import { EntitySelect } from "@/components/ui/entity-select";

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
 *
 * `EntitySelect` rather than a bare `<select>` because the department list is the
 * one here that grows without limit: a handful on a small site, hundreds on a
 * large one, and the picker has to stay usable at both sizes. It decides which
 * control to render from the number of options.
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
        <EntitySelect
          {...field}
          id={id}
          name={name}
          options={departments.map((department) => ({
            value: department.id,
            label: department.name,
          }))}
          placeholder="Choose a department…"
          searchPlaceholder="Search departments…"
          defaultValue={defaultValue ?? ""}
          disabled={disabled || empty}
          invalid={Boolean(error)}
        />
      )}
    </Field>
  );
}