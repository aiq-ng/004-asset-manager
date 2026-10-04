import { PrintTrigger } from "@/components/layout/print-trigger";
import { AssetTag } from "@/features/assets/asset-tag";
import type { AssetLabelDto } from "@/lib/services/assets";

/**
 * Batch of asset tags on A4, sized for a guillotine rather than an Avery sheet.
 *
 * Two decisions are worth stating, because both are load-bearing at volume.
 *
 * First, the sheet is plain A4 and not an adhesive template. Avery-style labels
 * have to be aligned by hand, which is fine for one sheet and quietly miserable
 * for five; you cannot correct a bad feed once the labels are half-peeled. A
 * stack cutter makes the step identical at 8 labels or 800, because you align
 * the stack against one edge and cut once through all of it. The tag absorbs the
 * imprecision — nothing but padding sits near an edge, the QR is centred in its
 * own column, and the frame is `aspect-video`, so a slightly crooked cut costs a
 * millimetre of whitespace rather than a scan.
 *
 * Second, `AssetTag` is reused exactly as-is. It sizes entirely in `cqw` inside
 * a `w-full @container`, so dropping it into a grid cell of any width is the
 * intended use of that component, not a stretch. No compact variant, no override
 * props, no second layout to keep in sync.
 */

/**
 * Per-page layout, and the cell width each implies.
 *
 * `cellWidthMm` is what actually decides whether the printed QR scans: the tag
 * gives its QR column `17.8cqw`, so module size is `cellWidthMm * 0.178` divided
 * by the QR's 33 modules including its quiet zone. Measured from the real encoder
 * output (version 3, 29x29 data modules for a URL like
 * `http://localhost:3000/assets/IT-LAP-0001`, plus the 2-module margin):
 *
 * - `safe`    — 2 x 5, 10 per page, 93.1mm cells -> 0.50 mm/module. Comfortable.
 * - `compact` — 3 x 7, 21 per page, 60.0mm cells -> 0.32 mm/module. On the edge.
 *
 * A tag that does not scan is a failed tag, and the cost of the safe default is
 * one sheet per ten, so `safe` is what a run starts on. `compact` halves the
 * paper for a 100-label run — 5 sheets instead of 10 — and is worth switching to
 * once the codes have been proven on your own printer and scanner, which is the
 * one check this component cannot do for you.
 *
 * On `gapMm`: what matters for a guillotine is that every gap on every sheet is
 * the same size, so a single alignment against one edge cuts every column.
 * `compact` deliberately does not fill the sheet — the gap that would make it
 * flush (8.2mm) shrinks the cells to 57.9mm and costs real scan reliability, so
 * it keeps a cuttable 5mm channel and leaves a strip at the foot of the page.
 * That strip is harmless; cut along the gaps the way the preview showed them.
 *
 * `safe` does fill it, and has to be tuned to do so. At a round 3.8mm the sheet
 * comes to 297.04mm — a fortieth of a millimetre past the paper — and the browser
 * answers that the only way to honour is an extra blank page after each one. That
 * is 12 sheets for 100 labels instead of 10, and it is invisible in the preview.
 * 3.6mm lands at 296.52mm, which fits with room to spare.
 */
export const LABEL_SHEET_PRESETS = {
  safe: { columns: 2, rows: 5, cellWidthMm: 93.2, gapMm: 3.6 },
  compact: { columns: 3, rows: 7, cellWidthMm: 60, gapMm: 5 },
} as const;

export type LabelSheetPreset = keyof typeof LABEL_SHEET_PRESETS;

export const DEFAULT_LABEL_SHEET_PRESET: LabelSheetPreset = "safe";

/** A4 with the page margin the grid geometry above assumes. */
const PAGE_MARGIN_MM = 10;

/**
 * Text of the red band under the logo mark.
 *
 * Deliberately duplicated from the single-label page rather than left to
 * `AssetTag`'s default, so that the two are visibly the same value and a change
 * to one is obviously a change to both. `AssetTag` stays untouched because it is
 * shared with the on-screen preview on the asset detail page.
 */
export const LOGO_LABEL = "Nigeria";

export function labelSheetCapacity(preset: LabelSheetPreset): number {
  const { columns, rows } = LABEL_SHEET_PRESETS[preset];
  return columns * rows;
}

export function labelSheetPageCount(count: number, preset: LabelSheetPreset): number {
  const capacity = labelSheetCapacity(preset);
  return count === 0 ? 0 : Math.ceil(count / capacity);
}

export function AssetLabelSheet({
  assets,
  preset = DEFAULT_LABEL_SHEET_PRESET,
}: {
  assets: AssetLabelDto[];
  preset: LabelSheetPreset;
}) {
  const { columns, rows, gapMm } = LABEL_SHEET_PRESETS[preset];
  const capacity = columns * rows;
  const pages: AssetLabelDto[][] = [];

  for (let i = 0; i < assets.length; i += capacity) {
    pages.push(assets.slice(i, i + capacity));
  }

  return (
    <>
      {/*
        Off for screen as well as print. A hundred tags on one scrolling page is
        unusable, and the operator only needs the on-screen version to confirm
        the selection before sending it to the printer.
      */}
      <div className="c54-label-preview c54-no-print">
        <SheetSummary assets={assets} preset={preset} pages={pages.length} />
      </div>

      {/*
        One grid per page. The break is explicit rather than left to
        `break-inside`, because a grid is not a single box to break: without this
        the page boundary lands wherever the flow happens to fall and can orphan
        the last row of a page onto the next sheet.
      */}
      <div className="c54-label-documents">
        {pages.map((page, pageIndex) => (
          <section
            key={pageIndex}
            className="c54-label-page"
            style={
              {
                "--label-columns": columns,
                "--label-rows": rows,
                "--label-margin": `${PAGE_MARGIN_MM}mm`,
                "--label-gap": `${gapMm}mm`,
              } as React.CSSProperties
            }
            aria-label={`Label sheet ${pageIndex + 1} of ${pages.length}`}
          >
            {page.map((asset) => (
              <div className="c54-label-cell" key={asset.assetId}>
                <AssetTag
                  assetNumber={asset.assetId}
                  device={asset.device}
                  position={asset.position}
                  positionTotal={asset.positionTotal}
                  serialNumber={asset.serialNumber ?? ""}
                  // Same override the single-label page passes. Left to its
                  // default the batch would print a different word in the red
                  // band than every label printed one at a time.
                  logoLabel={LOGO_LABEL}
                />
              </div>
            ))}
          </section>
        ))}
      </div>

      {/* On screen this is the toolbar that opens the print dialog. */}
      <PrintTrigger />
    </>
  );
}

/** Printed with the labels themselves: which sheet you are on and what is on it. */
function SheetSummary({
  assets,
  preset,
  pages,
}: {
  assets: AssetLabelDto[];
  preset: LabelSheetPreset;
  pages: number;
}) {
  const capacity = labelSheetCapacity(preset);

  return (
    <div className="space-y-c54-4">
      <div className="flex flex-wrap items-center justify-between gap-c54-3">
        <div>
          <p className="text-c54-lg font-c54-semibold text-c54-text-primary">
            {assets.length} {assets.length === 1 ? "label" : "labels"}
          </p>
          <p className="text-c54-sm text-c54-text-secondary">
            {pages} {pages === 1 ? "sheet" : "sheets"} of A4 · {capacity} per sheet ·{" "}
            {preset === "safe" ? "large" : "compact"} layout
          </p>
        </div>

        {pages > 1 ? (
          <p className="max-w-xs text-c54-xs text-c54-text-muted">
            If your tray runs short, print in batches. The print dialog can limit the
            run to a page range.
          </p>
        ) : null}
      </div>

      {pages > 1 ? (
        <p className="c54-label-runlist">
          {assets.map((asset) => asset.assetId).join(", ")}
        </p>
      ) : null}
    </div>
  );
}