"use client";

import { Select } from "@/components/ui/controls";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

/**
 * Above this many options the native menu stops being a list and starts being a
 * scrolling exercise.
 *
 * Twelve is chosen from the native menu's own behaviour rather than by taste: a
 * desktop `<select>` gives you type-ahead and a scrollbar, and below roughly a
 * screenful of rows that is genuinely faster than opening a search box and
 * typing. Past it, the person holding the mouse has to drag, watch rows go past
 * the target, and let go — the "doom scrolling" this replaces.
 *
 * It is deliberately not configurable per screen. The whole point is that the
 * decision is made from the data, so a list that quietly grows past the point of
 * comfort upgrades itself instead of needing somebody to remember.
 */
export const SEARCHABLE_THRESHOLD = 12;

export interface EntitySelectOption {
  value: string;
  label: string;
  /** Matched by search, not displayed. See `ComboboxOption.searchKeys`. */
  searchKeys?: string[];
}

export interface EntitySelectProps {
  options: EntitySelectOption[];
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Shown when nothing is chosen. Omit for a list with no empty option. */
  placeholder?: string;
  /** Instruction shown once the dropdown has opened for searching. */
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Force one branch or the other. `false` for fixed enums that never grow. */
  searchable?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

/**
 * A picker over a list that might be long.
 *
 * Renders a plain `<select>` for a handful of options and the searchable
 * `Combobox` for many, from the same props, so callers never have to think about
 * it: `DepartmentSelect` is a combobox on a 200-department company and a native
 * select on a three-desk one, from identical code.
 *
 * The trade is deliberate and worth stating. A custom dropdown is more work for
 * the browser than a native menu — no type-ahead from the OS, and the popup is
 * drawn by us — so it is only used where the native menu stops being usable. The
 * combobox keeps its own keyboard handling (arrows, Enter, Escape) and a hidden
 * input carrying the real name, so the surrounding `<form>` and Server Action
 * see the same shape of data either way.
 */
export function EntitySelect({
  options,
  searchable,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  ...rest
}: EntitySelectProps) {
  const useCombobox = searchable ?? options.length > SEARCHABLE_THRESHOLD;

  if (useCombobox) {
    return (
      <Combobox
        {...rest}
        options={options}
        // The search prompt stands in for the placeholder when there is none:
        // a searchable box with nothing written in it should say what it is
        // for, and "Select…" says nothing about which list is being picked from.
        placeholder={placeholder ?? searchPlaceholder}
        searchPlaceholder={searchPlaceholder ?? placeholder}
        emptyMessage={emptyMessage}
      />
    );
  }

  return (
    <Select
      id={rest.id}
      name={rest.name}
      disabled={rest.disabled}
      invalid={rest.invalid}
      required={rest.required}
      value={rest.value}
      defaultValue={rest.defaultValue}
      aria-describedby={rest["aria-describedby"]}
      aria-invalid={rest["aria-invalid"]}
      className={rest.className}
      onChange={(event) => rest.onChange?.(event.target.value)}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

export type { ComboboxOption };