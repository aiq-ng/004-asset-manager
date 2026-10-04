"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { QrCode } from "lucide-react";

import { Button, buttonClassName } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";

/**
 * Asset selection for bulk actions.
 *
 * Held in client state rather than in the URL, because selection is transient by
 * nature — it should not survive a refresh or land in a shared link — while the
 * sheet it produces *is* a URL and does. The split is deliberate: ephemeral
 * choosing, durable output.
 *
 * The provider sits above the table so that the rows stay Server Components. Only
 * the checkboxes and the bar need to be interactive, and lifting one context over
 * the whole list is cheaper than making fifty rows client components.
 */
const SelectionContext = createContext<{
  selected: Set<string>;
  toggle: (assetId: string) => void;
  setMany: (assetIds: string[], selected: boolean) => void;
  clear: () => void;
  /** Every asset number matching the active filter, across all pages. */
  matching: string[];
} | null>(null);

export function AssetSelectionProvider({
  matching,
  children,
}: {
  matching: string[];
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((assetId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(assetId)) next.add(assetId);
      return next;
    });
  }, []);

  const setMany = useCallback((assetIds: string[], on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const assetId of assetIds) {
        if (on) next.add(assetId);
        else next.delete(assetId);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const value = useMemo(
    () => ({ selected, toggle, setMany, clear, matching }),
    [selected, toggle, setMany, clear, matching],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

function useSelection() {
  const context = useContext(SelectionContext);
  // Never a silent no-op: a checkbox rendered outside the provider would look
  // broken rather than absent, and this should be impossible to reach by accident.
  if (!context) throw new Error("Asset selection used outside AssetSelectionProvider");
  return context;
}

export function AssetSelectCheckbox({ assetId }: { assetId: string }) {
  const { selected, toggle } = useSelection();

  return (
    <Checkbox
      checked={selected.has(assetId)}
      onChange={() => toggle(assetId)}
      aria-label={`Select ${assetId}`}
    />
  );
}

/**
 * Header checkbox: selects the whole filtered set, not just the visible page.
 *
 * That scope is the point, and it is why this reads `matching` from context
 * rather than being handed the rows it happens to sit above. On a register of a
 * hundred laptops the alternative is five pages of manual ticking, which is
 * exactly the chore the label sheet is meant to remove. The indeterminate state
 * is shown because a partially selected filter is the normal case while someone
 * narrows down from "all available".
 */
export function AssetSelectAllCheckbox() {
  const { selected, setMany, matching } = useSelection();

  const selectedMatching = matching.filter((assetId) => selected.has(assetId)).length;
  const all = matching.length > 0 && selectedMatching === matching.length;
  const some = selectedMatching > 0 && !all;

  return (
    <Checkbox
      checked={all}
      // `indeterminate` is a DOM property, not an attribute: React cannot set it
      // declaratively, so it has to be assigned to the element directly.
      ref={(node) => {
        if (node) node.indeterminate = some;
      }}
      onChange={() => setMany(matching, !all)}
      aria-label={
        all ? "Clear selection" : `Select all ${matching.length} matching assets`
      }
    />
  );
}

/**
 * The bar that appears once anything is selected.
 *
 * Fixed to the top of the viewport, just under the sticky masthead, rather than
 * floating at the bottom: selection starts at a checkbox wherever the row sits
 * in a long table, and a bottom-anchored bar is not even on screen for the rows
 * near the top — the tick happens, nothing answers. Pinned under the header it
 * is visible from the first tick at any scroll position, and being out of the
 * document flow it never shifts the table when it appears or disappears.
 *
 * A link rather than a button that navigates, because the destination is a real
 * page: the run can be previewed, bookmarked, shared or re-printed, and the
 * browser's Back button means the way out of a hundred-label run is the same as
 * everywhere else.
 */
export function LabelPrintBar() {
  const { selected, clear } = useSelection();
  const count = selected.size;

  if (count === 0) return null;

  // Sorted so the sheet comes out in asset order regardless of the order they
  // were ticked, and the query string is stable enough to be pasted.
  const ids = [...selected].sort();

  return (
    <div className="c54-no-print fixed inset-x-0 top-[calc(var(--c54-header-height)+0.5rem)] z-30 flex justify-center px-c54-4">
      <div className="flex animate-rise-up items-center gap-c54-3 rounded-c54-card border border-c54-border-strong bg-c54-bg-elevated py-c54-2 pl-c54-pad-lg pr-c54-2 shadow-c54-lg">
        <p className="text-c54-sm text-c54-text-primary">
          <span className="font-c54-mono font-c54-semibold">{count}</span>{" "}
          {count === 1 ? "asset" : "assets"} selected
        </p>

        <Link href={`/assets/labels?ids=${ids.join(",")}`} className={buttonClassName("primary", "sm")}>
          <QrCode className="size-3.5" />
          Print labels
        </Link>

        <Button size="sm" variant="secondary" onClick={clear}>
          Clear
        </Button>
      </div>
    </div>
  );
}