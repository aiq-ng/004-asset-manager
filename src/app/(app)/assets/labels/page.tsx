import Link from "next/link";

import { buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Icons } from "@/components/ui/icons";
import {
  AssetLabelSheet,
  DEFAULT_LABEL_SHEET_PRESET,
  LABEL_SHEET_PRESETS,
  labelSheetCapacity,
  type LabelSheetPreset,
} from "@/features/assets/asset-label-sheet";
import { listAssetsForLabels } from "@/lib/services/assets";
import { requirePageActor } from "@/lib/server/guard";

/**
 * Batch label sheet.
 *
 * The selection arrives as asset numbers in the query string rather than as a
 * session, because a label run has to survive the browser's own print pipeline:
 * the operator can preview, re-print, or reopen the exact same sheet tomorrow
 * without re-selecting anything. `ids` is also the natural unit here — it is what
 * gets engraved, and it stays valid if the asset moves pages in the register.
 *
 * `preset` is read from the URL too, so switching layout does not silently change
 * which labels are in the run.
 */
export default async function AssetLabelsPage({
  searchParams,
}: PageProps<"/assets/labels">) {
  await requirePageActor();
  const params = await searchParams;

  // Split on comma rather than repeated params: it keeps a hundred-asset selection
  // to one key and reads back cleanly if the URL is shared or bookmarked.
  const ids = firstParam(params.ids)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const preset = parsePreset(params.preset);
  const assets = await listAssetsForLabels(ids);

  if (assets.length === 0) {
    return (
      <>
        <div className="c54-no-print mb-c54-section">
          <Link
            href="/assets"
            className="inline-flex items-center gap-c54-2 text-c54-sm text-c54-text-secondary transition-colors hover:text-c54-text-primary"
          >
            <Icons.ArrowLeft className="size-4" />
            Back to assets
          </Link>
        </div>
        <EmptyState
          title="No labels to print"
          description="Pick assets from the register and choose Print labels to build a sheet."
          action={
            <Link href="/assets" className={buttonClassName("secondary", "md")}>
              Go to assets
            </Link>
          }
        />
      </>
    );
  }

  const capacity = labelSheetCapacity(preset);
  const dropped = ids.length - assets.length;

  return (
    <>
      <div className="c54-no-print mb-c54-section flex flex-wrap items-center justify-between gap-c54-3">
        <Link
          href="/assets"
          className="inline-flex items-center gap-c54-2 text-c54-sm text-c54-text-secondary transition-colors hover:text-c54-text-primary"
        >
          <Icons.ArrowLeft className="size-4" />
          Back to assets
        </Link>

        {/* The toggle is links rather than a form: both layouts print the same
            labels, so there is nothing to submit, and a link makes each size
            bookmarkable and back-button friendly. */}
        <div className="flex items-center gap-c54-1">
          <span className="text-c54-xs text-c54-text-muted">Layout</span>
          {(Object.keys(LABEL_SHEET_PRESETS) as LabelSheetPreset[]).map((key) => (
            <Link
              key={key}
              href={`/assets/labels?ids=${ids.join(",")}&preset=${key}`}
              aria-current={key === preset ? "true" : undefined}
              className={buttonClassName(key === preset ? "primary" : "secondary", "sm")}
            >
              {key === "safe" ? "Large" : "Compact"} · {labelSheetCapacity(key)}
            </Link>
          ))}
        </div>
      </div>

      {/*
        Assets can go missing between selecting them and opening the sheet (a
        retirement, say). One vanished asset should not silently shorten the run.
      */}
      {dropped > 0 ? (
        <div className="c54-no-print mb-c54-section rounded-c54-card border border-c54-border-default bg-c54-warning-subtle px-c54-pad-lg py-c54-3 text-c54-sm text-c54-warning-text">
          {dropped} selected {dropped === 1 ? "asset is" : "assets are"} no longer on the
          register and {dropped === 1 ? "was" : "were"} left out. The remaining{" "}
          {assets.length} will print.
        </div>
      ) : null}

      {assets.length > capacity ? (
        <p className="c54-no-print mb-c54-section text-c54-sm text-c54-text-muted">
          This is more than one sheet ({Math.ceil(assets.length / capacity)} pages). Print in
          batches if your tray runs short.
        </p>
      ) : null}

      <AssetLabelSheet assets={assets} preset={preset} />
    </>
  );
}

/** A repeated query key arrives as an array; only the first value is meaningful. */
function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function parsePreset(value: string | string[] | undefined): LabelSheetPreset {
  const raw = firstParam(value);
  return raw === "compact" || raw === "safe" ? raw : DEFAULT_LABEL_SHEET_PRESET;
}