"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/controls";
import { Icons } from "@/components/ui/icons";
import { buildQuery } from "@/lib/utils/search-params";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDefinition {
  name: string;
  label: string;
  value: string;
  options: FilterOption[];
}

/**
 * URL-driven filter bar.
 *
 * Filter state lives in the query string rather than in React state, so a filtered
 * view is shareable, survives a refresh, and needs no extra server round trip —
 * the Server Component re-renders from the new `searchParams` alone.
 *
 * Selects push immediately; the text input waits for Enter or a short pause,
 * because pushing on every keystroke would fire a query per character.
 */
export function FilterBar({
  term = "q",
  placeholder = "Search",
  current,
  selects = [],
}: {
  /** Query-string key backing the text input. */
  term?: string;
  placeholder?: string;
  /** Current query, used to seed the inputs. */
  current: Record<string, string>;
  selects?: FilterDefinition[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The URL is the source of truth, so the box is reset whenever it changes
  // underneath us — a back navigation, or a preset chip rewriting `q`. Comparing
  // against the last seen value and re-rendering in the same pass is React's
  // recommended alternative to syncing props into state from an effect.
  const committed = current[term] ?? "";
  const [text, setText] = useState(() => committed);
  const [synced, setSynced] = useState(committed);

  if (committed !== synced) {
    setSynced(committed);
    setText(committed);
  }

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  function setParam(key: string, value: string) {
    if (debounce.current) {
      clearTimeout(debounce.current);
      debounce.current = null;
    }

    const next: Record<string, string> = {};
    for (const [name, entry] of searchParams.entries()) next[name] = entry;
    if (value) next[key] = value;
    else delete next[key];

    // A changed filter invalidates the current offset, otherwise page 7 of the
    // old result set can be requested against a much shorter new one.
    delete next.page;

    router.push(`${pathname}${buildQuery(next)}`, { scroll: false });
  }

  const activeCount = Array.from(searchParams.keys()).filter((key) => key !== "page").length;

  return (
    // The row packs to the left on purpose: the selects sit right beside the
    // search box rather than scattered across it, because a filter that reads as
    // attached to the search is read as applying to the same list. `flex-1` on
    // the form used to stretch it across the row and shove every select to the
    // far edge, which is exactly the gap this layout exists to avoid.
    <div className="flex flex-col gap-c54-3 xl:flex-row xl:items-end">
      <form
        className="relative w-full xl:w-[15.5rem]"
        onSubmit={(event) => {
          event.preventDefault();
          setParam(term, text.trim());
        }}
      >
        <label htmlFor="filter-search" className="sr-only">
          {placeholder}
        </label>
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-9 items-center justify-center text-c54-text-muted">
          <Icons.Search />
        </span>
        {/* Left padding is a plain `pl-9` on purpose: the token package ships
            no `--c54-space-9`, so a `pl-c54-9` here would silently not compile
            and the text would slide under the search icon. */}
        <input
          id="filter-search"
          name={term}
          value={text}
          onChange={(event) => {
            const value = event.target.value;
            setText(value);
            if (debounce.current) clearTimeout(debounce.current);
            debounce.current = setTimeout(() => setParam(term, value.trim()), 400);
          }}
          placeholder={placeholder}
          className="h-9 w-full max-w-[15.5rem] rounded-c54-input border border-c54-border-default bg-c54-bg-card pr-c54-3 pl-9 text-c54-sm text-c54-text-primary placeholder:text-c54-text-muted transition-[border-color,box-shadow] duration-c54-fast hover:border-c54-border-strong focus:border-c54-action-primary focus:ring-2 focus:ring-c54-action-primary/25 focus:outline-none"
        />
      </form>

      {selects.map((select) => (
        <div key={select.name} className="w-full xl:w-44">
          <label
            htmlFor={`filter-${select.name}`}
            className="mb-c54-1 block text-c54-2xs font-c54-semibold tracking-c54-widest text-c54-text-muted uppercase"
          >
            {select.label}
          </label>
          <Select
            id={`filter-${select.name}`}
            value={select.value}
            onChange={(event) => setParam(select.name, event.target.value)}
          >
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ))}

      {activeCount > 0 ? (
        <Button variant="ghost" onClick={() => router.push(pathname, { scroll: false })}>
          Clear
          <Icons.Close className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}