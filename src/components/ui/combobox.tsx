"use client";

import { useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";
import { CONTROL_BASE, CONTROL_INVALID, ChevronDownIcon } from "@/components/ui/controls";

export interface ComboboxOption {
  value: string;
  label: string;
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
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedValue, setSelectedValue] = useState(value ?? defaultValue ?? "");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === selectedValue)?.label ?? "",
    [options, selectedValue],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, search]);

  function selectOption(optionValue: string) {
    setSelectedValue(optionValue);
    onChange?.(optionValue);
    setOpen(false);
    setSearch("");
  }

  function handleTriggerClick() {
    if (disabled) return;
    setOpen((current) => !current);
    setSearch("");
    setHighlightedIndex(-1);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
        selectOption(filtered[highlightedIndex].value);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input type="hidden" name={name} value={selectedValue} />

      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid || invalid || undefined}
          aria-required={required || undefined}
          id={id}
          className={cn(
            CONTROL_BASE,
            "h-9 cursor-pointer pr-c54-8",
            invalid && CONTROL_INVALID,
          )}
          value={open ? search : selectedLabel}
          placeholder={placeholder}
          readOnly={!open}
          disabled={disabled}
          onClick={handleTriggerClick}
          onFocus={() => {
            if (!open) {
              setOpen(true);
              setSearch("");
            }
          }}
          onKeyDown={handleSearchKeyDown}
          onChange={(event) => {
            setSearch(event.target.value);
            setHighlightedIndex(-1);
          }}
        />
        <ChevronDownIcon
          className={cn(
            "pointer-events-none absolute top-1/2 right-c54-3 size-3.5 -translate-y-1/2 text-c54-text-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </div>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
          />
          <div
            role="listbox"
            id={listId}
            className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-c54-card border border-c54-border-default bg-c54-bg-card py-c54-1 shadow-c54-popover"
          >
            {filtered.length === 0 ? (
              <p className="px-c54-3 py-c54-2 text-c54-xs text-c54-text-muted">{emptyMessage}</p>
            ) : (
              filtered.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === selectedValue}
                  className={cn(
                    "flex w-full items-center px-c54-3 py-c54-2 text-left text-c54-xs transition-colors",
                    index === highlightedIndex
                      ? "bg-c54-action-ghost-hover"
                      : "hover:bg-c54-action-ghost-hover",
                    option.value === selectedValue && "font-c54-medium",
                  )}
                  onClick={() => selectOption(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
