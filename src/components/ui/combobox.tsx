"use client";

import {
  Combobox as HeadlessCombobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption as HeadlessOption,
  ComboboxOptions,
} from "@headlessui/react";
import { useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";
import { CONTROL_BASE, CONTROL_INVALID, ChevronDownIcon } from "@/components/ui/controls";

export interface ComboboxOption {
  value: string;
  label: string;
  /**
   * Extra text matched by the search but not shown in the row.
   *
   * The staff picker displays "Ana Ribeiro — Finance" but people also look
   * people up by email address, so `email` goes here rather than in the label:
   * matching is then honest about what the field does, without padding every row
   * with an address nobody reads twice.
   */
  searchKeys?: string[];
}

export interface ComboboxProps {
  options: ComboboxOption[];
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  required?: boolean;
}

/**
 * A searchable single-choice picker over a long list.
 *
 * Built on Headless UI's combobox primitives, which own the parts that were
 * hand-rolled and easy to get subtly wrong: the listbox ARIA wiring, typeahead
 * on the keyboard, focus and `aria-activedescendant` tracking, and closing on
 * outside click. What stays local is the filtering — a plain substring match
 * over the label and the `searchKeys`, because the matching rules are a
 * property of this app's data, not of the widget.
 *
 * The exported shape is deliberately unchanged from the hand-rolled version so
 * `EntitySelect` and its five call sites carry on working unchanged; Headless
 * UI is an implementation detail of this file, not a new contract.
 */
export function Combobox({
  options,
  name,
  value,
  defaultValue,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches",
  invalid,
  disabled,
  className,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  required,
}: ComboboxProps) {
  const [query, setQuery] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);

  /**
   * A `value` prop makes this controlled, and that is the difference that
   * matters in the filter bar: it passes the value out of the URL, so clearing
   * the filters has to move the box back to "Any brand" even though nothing
   * here chose it. Internal state alone would keep showing the old selection.
   */
  const controlled = value !== undefined;
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
  const selectedValue = controlled ? value : uncontrolled;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.searchKeys?.some((key) => key.toLowerCase().includes(needle)),
    );
  }, [options, query]);

  /**
   * Virtual scrolling keys off the option *values*, because that is what the
   * combobox holds; the label is looked back up from the row being drawn. Both
   * are memoised because the virtualiser re-measures whenever it is handed a
   * new list, and a fresh array every render would throw away the scroll
   * position mid-drag.
   */
  const filteredValues = useMemo(() => filtered.map((option) => option.value), [filtered]);
  const labelByValue = useMemo(
    () => new Map(filtered.map((option) => [option.value, option.label])),
    [filtered],
  );

  function displayLabel(selected: string) {
    return options.find((option) => option.value === selected)?.label ?? "";
  }

  return (
    <div className={cn("relative", className)}>
      <HeadlessCombobox
        // A string value, so the hidden input Headless UI renders for `name` is
        // a single field carrying the bare value rather than `name[value]`.
        value={selectedValue}
        defaultValue={defaultValue ?? ""}
        onChange={(next) => {
          const picked = next ?? "";
          if (!controlled) setUncontrolled(picked);
          onChange?.(picked);
        }}
        // Every path out of the open state clears the query. Not cosmetic:
        // reopening with the last filter still applied makes the list look
        // empty, and the first instinct is that the data is gone.
        onClose={() => setQuery("")}
        disabled={disabled}
        name={name}
        // Only the rows on screen are rendered. Without this, a company with a
        // thousand staff puts a thousand option elements in the document, each
        // one Headless UI has to track for focus and selection: the list gets
        // slow to open and slower to scroll, which is the whole reason the
        // filter bar searches rather than scrolls. Off for an empty list,
        // because the empty message below is a static child and virtual mode
        // takes over the children slot for its per-row template.
        virtual={filtered.length > 0 ? { options: filteredValues } : null}
      >
        {({ open }) => (
          <>
            <ComboboxInput
              id={id}
              // `pl-c54-3`/`pr-c54-8` are the select's own measurements, so a picker that
              // upgrades itself does not shift sideways by twelve pixels when it does. The
              // right padding clears the chevron.
              className={cn(
                CONTROL_BASE,
                "h-9 cursor-pointer py-0 pr-c54-8 pl-c54-3",
                invalid && CONTROL_INVALID,
              )}
              displayValue={displayLabel}
              aria-describedby={ariaDescribedBy}
              // `aria-required` rather than `required`: the field is not natively
              // validated, because the browser would block the submit and say
              // nothing about which picker was empty. The Server Action owns that.
              aria-required={required || undefined}
              aria-invalid={ariaInvalid || invalid || undefined}
              // The box doubles as the search field, so which prompt is showing
              // depends on what it is currently for: the empty-state message when
              // closed, and an instruction to type once it has become one.
              placeholder={open ? searchPlaceholder : placeholder}
              onChange={(event) => setQuery(event.target.value)}
              // Headless UI opens the list when you type or press a key, and
              // when you click the chevron button, but not when you click the
              // text field itself — which is the part people aim at. Forwarding
              // the click to the button gives the whole box the toggle behaviour
              // a select is expected to have.
              onClick={() => buttonRef.current?.click()}
            />
            <ComboboxButton
              ref={buttonRef}
              className="group absolute inset-y-0 right-0 flex w-8 items-center justify-center text-c54-text-muted"
            >
              <ChevronDownIcon className="size-3.5 transition-transform group-data-open:rotate-180" />
            </ComboboxButton>

            <ComboboxOptions
              // Deliberately *not* using Headless UI's `anchor`. Anchoring implies
              // a portal to the end of the body, and a modal dialog here is opened
              // with `showModal()`, which puts it in the browser's top layer —
              // above every z-index on the page. A portalled panel therefore opens
              // *behind* the sheet that contains it and cannot be clicked. Staying
              // in place keeps the list a child of whatever holds the field, so
              // `z-50` against local siblings is enough. The trade is that the
              // panel does not flip above the field near the bottom of the window;
              // at `max-h-60` it is small enough that scrolling the page a little
              // is the whole remedy.
              className={cn(
                "absolute top-full left-0 z-50 mt-1 w-full max-h-60 overflow-auto",
                // A thousand-row list under the pointer should not drag the page
                // with it when it runs out of rows.
                "overscroll-contain",
                "rounded-c54-card border border-c54-border-default bg-c54-bg-card py-c54-1 shadow-c54-popover",
              )}
            >
              {filtered.length === 0 ? (
                <p className="px-c54-3 py-c54-2 text-c54-xs text-c54-text-muted">{emptyMessage}</p>
              ) : (
                ({ option }: { option: string }) => (
                  <HeadlessOption
                    key={option}
                    value={option}
                    className="flex w-full cursor-pointer items-center px-c54-3 py-c54-2 text-left text-c54-xs text-c54-text-primary data-focus:bg-c54-action-ghost-hover data-selected:font-c54-medium"
                  >
                    {labelByValue.get(option) ?? option}
                  </HeadlessOption>
                )
              )}
            </ComboboxOptions>
          </>
        )}
      </HeadlessCombobox>
    </div>
  );
}