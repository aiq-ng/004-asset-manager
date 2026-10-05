import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { PrintControls } from "@/components/layout/print-controls";
import { AssetTag } from "@/features/assets/asset-tag";
import { listAssetsForLabels } from "@/lib/services/assets";
import { requirePageActor } from "@/lib/server/guard";
import { ExportJpegButton } from "@/components/ui/export-to-jpg";

/**
 * Batch label run.
 *
 * One tag per printed page, in the order the ids were selected, so "Save as PDF"
 * produces a single file for the print vendor: page N is tag N. The selection
 * arrives as asset numbers in the query string rather than as a session, because
 * a label run has to survive the browser's own print pipeline: the operator can
 * preview, re-print, or reopen the exact same run tomorrow without re-selecting
 * anything. `ids` is also the natural unit here — it is what gets engraved, and
 * it stays valid if the asset moves pages in the register.
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

  const assets = await listAssetsForLabels(ids);

  if (assets.length === 0) {
    return (
      <>
        <div className="c54-no-print mb-c54-section">
          <Link
            href="/assets"
            className="inline-flex items-center gap-c54-2 text-c54-sm text-c54-text-secondary transition-colors hover:text-c54-text-primary"
          >
            <ArrowLeft className="size-4" />
            Back to assets
          </Link>
        </div>
        <EmptyState
          title="No labels to print"
          description="Pick assets from the register and choose Print labels to build a run."
          action={
            <Link href="/assets" className={buttonClassName("secondary", "md")}>
              Go to assets
            </Link>
          }
        />
      </>
    );
  }

  const dropped = ids.length - assets.length;

  return (
    <>
      <div className="c54-no-print mb-c54-section">
        <Link
          href="/assets"
          className="inline-flex items-center gap-c54-2 text-c54-sm text-c54-text-secondary transition-colors hover:text-c54-text-primary"
        >
          <ArrowLeft className="size-4" />
          Back to assets
        </Link>
      </div>

      {/*
        Assets can go missing between selecting them and opening the run (a
        retirement, say). One vanished asset should not silently shorten the run.
      */}
      {dropped > 0 ? (
        <div className="c54-no-print mb-c54-section rounded-c54-card border border-c54-border-default bg-c54-warning-subtle px-c54-pad-lg py-c54-3 text-c54-sm text-c54-warning-text">
          {dropped} selected {dropped === 1 ? "asset is" : "assets are"} no
          longer on the register and {dropped === 1 ? "was" : "were"} left out.
          The remaining {assets.length} will print.
        </div>
      ) : null}

      <p className="c54-no-print mb-c54-section text-c54-sm text-c54-text-muted">
        {assets.length} {assets.length === 1 ? "label" : "labels"}, one per
        page. Save as PDF to send to the printer, and check the page count
        matches.
      </p>

      {/* Print and export side by side: two routes to the same label, so they
          belong in one row rather than stacked around the settings note. */}
      <PrintControls label={`Print ${assets.length} ${assets.length === 1 ? "label" : "labels"}`}>
        <ExportJpegButton
          logoLabel="Nigeria"
          assets={assets.map((a) => ({
            assetId: a.assetId,
            device: a.device,
            position: a.position,
            serialNumber: a.serialNumber ?? "",
          }))}
        />
      </PrintControls>

      {/* The tags must be direct siblings: the print stylesheet breaks the page
          after every tag except the `:last-child`, and wrapping each one would
          make every tag its own last child and remove every page break. On
          screen they stack with a gap; in print the wrapper is a plain block so
          nothing sits between pages. */}
      <div className="flex flex-col gap-c54-4 print:block">
        {assets.map((asset) => (
          <AssetTag
            key={asset.assetId}
            logoLabel="Nigeria"
            assetNumber={asset.assetId}
            device={asset.device}
            position={asset.position}
            serialNumber={asset.serialNumber ?? ""}
          />
        ))}
      </div>
    </>
  );
}

/** A repeated query key arrives as an array; only the first value is meaningful. */
function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
